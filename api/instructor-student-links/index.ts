/**
 * Instructor-Student Links API — consolidated Serverless Function (Hobby plan: max 12 functions)
 *
 * Routes handled:
 *   GET  /api/instructor-student-links          — list all links for authenticated user
 *   POST /api/instructor-student-links          — create link request (student invites instructor)
 *   GET  /api/instructor-student-links/pending  — pending requests for instructor
 *   PATCH /api/instructor-student-links/:id     — accept or revoke a link
 *
 * ADR-005: Supabase JWT required.
 * ADR-003: RLS enforces row-level security.
 * SEC-001: Rate limiting on all routes.
 * SEC4-02: Explicit instructor ownership check in accept path (defense-in-depth).
 * DDD-007: canAccept / canRevoke domain helpers.
 * DDD-008: Guard against no-op revocation.
 *
 * LGPD: only name/email of own students are returned.
 * Clinical constraint: no clinical data (stamps, cycles, observations) in any response.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { handle } from 'hono/vercel';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient, createServiceClient } from '../_lib/supabaseClient';
import { badRequest, conflict, forbidden, internalError, notFound } from '../_lib/errorHandler';
import { CreateLinkSchema, PatchLinkSchema } from '../_lib/schemas/linkSchemas';
import { getNotificationService } from '../_lib/notifications/factory';

// ─── pending endpoint types ───────────────────────────────────────────────────

type PendingLinkItem = {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  status: 'pending';
  invited_at: string;
};

interface RawLinkRow {
  id: string;
  student_id: string;
  instructor_id: string;
  status: string;
  invited_at: string;
  user_profiles: {
    full_name: string | null;
    email: string;
  } | null;
}

// ─── Domain helpers (DDD-007) ──────────────────────────────────────────────────

function canAccept(link: { status: string }): boolean {
  return link.status === 'pending';
}

function canRevoke(link: { status: string }): boolean {
  return link.status !== 'revoked';
}

/**
 * deriveLinkStatus — pure helper (unit-testable, no side-effects).
 *
 * For a student caller: returns the highest-priority link status across all
 * their rows: 'active' > 'pending' > 'none'.
 * For any other role (instructor, admin): returns null (field not applicable).
 *
 * LGPD/clinical: receives only the status field — no personal or clinical data.
 */
export function deriveLinkStatus(
  rows: Array<{ status: string }>,
  role: string,
): 'active' | 'pending' | 'none' | null {
  if (role !== 'student') return null;
  if (rows.some((r) => r.status === 'active')) return 'active';
  if (rows.some((r) => r.status === 'pending')) return 'pending';
  return 'none';
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono();

app.use('*', apiRateLimit);
app.use('*', requireAuth);

// ─── GET /api/instructor-student-links ────────────────────────────────────────

app.get('/', async (c) => {
  const auth = c.get('auth');
  const supabase = createAuthenticatedClient(auth.jwt);

  const { data, error } = await supabase
    .from('instructor_student_links')
    .select('id, instructor_id, student_id, status, invited_at, accepted_at, revoked_at, revoked_by')
    .order('invited_at', { ascending: false });

  if (error) return internalError(c, error);

  return c.json({ data: data ?? [], linkStatus: deriveLinkStatus(data ?? [], auth.role) });
});

// ─── POST /api/instructor-student-links ───────────────────────────────────────

app.post('/', zValidator('json', CreateLinkSchema), async (c) => {
  const auth = c.get('auth');
  const body = c.req.valid('json');

  if (auth.role !== 'student') {
    return forbidden(c, 'Only students can invite instructors');
  }

  if (body.instructor_id === auth.userId) {
    return badRequest(c, 'Cannot create a link with yourself');
  }

  const supabase = createAuthenticatedClient(auth.jwt);
  const serviceClient = createServiceClient();

  const { data, error } = await supabase
    .from('instructor_student_links')
    .insert({
      student_id: auth.userId,
      instructor_id: body.instructor_id,
      status: 'pending',
    })
    .select('id, instructor_id, student_id, status, invited_at, accepted_at, revoked_at, revoked_by')
    .single();

  if (error) {
    if (error.code === '23505') {
      return conflict(c, 'A link with this instructor already exists');
    }
    if (error.code === '23514') {
      return badRequest(c, 'Invalid link data: check constraint violation');
    }
    return internalError(c, error);
  }

  if (!data) return internalError(c, new Error('Insert succeeded but no data returned'));

  await serviceClient.from('audit_log').insert({
    entity_type: 'instructor_student_links',
    entity_id: data.id,
    action: 'LINK_INVITED',
    actor_id: auth.userId,
    actor_role: auth.role,
    before_data: null,
    after_data: { instructor_id: body.instructor_id, status: 'pending' },
  });

  void (async () => {
    try {
      const notificationService = getNotificationService();
      await notificationService.dispatch({
        type: 'link_request',
        recipientId: body.instructor_id,
        entityId: data.id as string,
        metadata: {},
      });
    } catch {
      // Intentionally swallowed
    }
  })();

  return c.json({ data }, 201);
});

// ─── GET /api/instructor-student-links/pending ────────────────────────────────

app.get('/pending', async (c) => {
  const auth = c.get('auth');

  if (auth.role !== 'instructor') {
    return forbidden(c, 'Only instructors can view pending link requests');
  }

  const supabase = createAuthenticatedClient(auth.jwt);

  const { data, error } = await supabase
    .from('instructor_student_links')
    .select('id, student_id, instructor_id, status, invited_at, user_profiles(full_name, email)')
    .eq('instructor_id', auth.userId)
    .eq('status', 'pending')
    .order('invited_at', { ascending: false });

  if (error) return internalError(c, error);

  const rows = (data ?? []) as unknown as RawLinkRow[];

  const links: PendingLinkItem[] = rows.map((row) => ({
    id: row.id,
    student_id: row.student_id,
    student_name: row.user_profiles?.full_name ?? '',
    student_email: row.user_profiles?.email ?? '',
    status: 'pending' as const,
    invited_at: row.invited_at,
  }));

  return c.json({ links });
});

// ─── PATCH /api/instructor-student-links/:id ──────────────────────────────────

app.patch('/:id', zValidator('json', PatchLinkSchema), async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const { action } = c.req.valid('json');
  const supabase = createAuthenticatedClient(auth.jwt);
  const serviceClient = createServiceClient();

  // CC-006: declare now once
  const now = new Date().toISOString();

  const { data: link, error: fetchError } = await supabase
    .from('instructor_student_links')
    .select('id, instructor_id, student_id, status, invited_at, accepted_at, revoked_at, revoked_by')
    .eq('id', id)
    .single();

  if (fetchError) return internalError(c, fetchError);
  if (!link) return notFound(c, 'Link not found');

  if (action === 'accept') {
    if (auth.role !== 'instructor') {
      return forbidden(c, 'Only instructors can accept invitations');
    }

    if (link.instructor_id !== auth.userId) {
      return forbidden(c, 'Only the linked instructor can accept this invitation');
    }

    if (!canAccept(link)) {
      return badRequest(c, 'Only pending links can be accepted');
    }

    const { data: updated, error: updateError } = await supabase
      .from('instructor_student_links')
      .update({ status: 'active', accepted_at: now })
      .eq('id', id)
      .select('id, instructor_id, student_id, status, invited_at, accepted_at, revoked_at, revoked_by')
      .single();

    if (updateError || !updated) return internalError(c, updateError);

    await serviceClient.from('audit_log').insert({
      entity_type: 'instructor_student_links',
      entity_id: id,
      action: 'LINK_ACCEPTED',
      actor_id: auth.userId,
      actor_role: auth.role,
      before_data: { status: 'pending' },
      after_data: { status: 'active' },
    });

    void (async () => {
      try {
        const notificationService = getNotificationService();
        await notificationService.dispatch({
          type: 'link_accepted',
          recipientId: link.student_id as string,
          entityId: id,
          metadata: {},
        });
      } catch {
        // Intentionally swallowed
      }
    })();

    return c.json({ data: updated });
  }

  // action === 'revoke'
  const isInstructor = auth.role === 'instructor' && link.instructor_id === auth.userId;
  const isStudent = auth.role === 'student' && link.student_id === auth.userId;

  if (!isInstructor && !isStudent) {
    return forbidden(c, 'You do not have permission to revoke this link');
  }

  // DDD-008: guard against no-op revocation
  if (!canRevoke(link)) {
    return badRequest(c, 'Link is already revoked');
  }

  const { data: updated, error: updateError } = await supabase
    .from('instructor_student_links')
    .update({
      status: 'revoked',
      revoked_at: now,
      revoked_by: auth.userId,
    })
    .eq('id', id)
    .select('id, instructor_id, student_id, status, invited_at, accepted_at, revoked_at, revoked_by')
    .single();

  if (updateError || !updated) return internalError(c, updateError);

  await serviceClient.from('audit_log').insert({
    entity_type: 'instructor_student_links',
    entity_id: id,
    action: 'LINK_REVOKED',
    actor_id: auth.userId,
    actor_role: auth.role,
    before_data: { status: link.status },
    after_data: { status: 'revoked', revoked_by: auth.userId },
  });

  return c.json({ data: updated });
});

// ─── Vercel exports ───────────────────────────────────────────────────────────

export default app;

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
