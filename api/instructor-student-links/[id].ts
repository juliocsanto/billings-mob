import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient, createServiceClient } from '../_lib/supabaseClient';
import { badRequest, forbidden, internalError, notFound } from '../_lib/errorHandler';
import { PatchLinkSchema } from './schema';
import { getNotificationService } from '../_lib/notifications/factory';

const app = new Hono();

// Rate limiting (SEC-001)
app.use('*', apiRateLimit);
app.use('*', requireAuth);

// ─── PATCH /api/instructor-student-links/:id ───────────────────────────────
app.patch('/:id', zValidator('json', PatchLinkSchema), async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const { action } = c.req.valid('json');
  const supabase = createAuthenticatedClient(auth.jwt);
  const serviceClient = createServiceClient();

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
    // SEC4-02: Explicit instructor ownership check — mirrors the pattern in revoke.
    // RLS is the last line of defence, but authz must be enforced in the use-case
    // layer too (defence in depth).
    if (link.instructor_id !== auth.userId) {
      return forbidden(c, 'Only the linked instructor can accept this invitation');
    }
    if (link.status !== 'pending') {
      return badRequest(c, 'Only pending links can be accepted');
    }

    const { data: updated, error: updateError } = await supabase
      .from('instructor_student_links')
      .update({ status: 'active', accepted_at: new Date().toISOString() })
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

    // Notify student that their link request was accepted (ADR-012)
    // Fire-and-forget: notification failures must never interrupt the operation.
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

  const { data: updated, error: updateError } = await supabase
    .from('instructor_student_links')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
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

export default app;

import { handle } from 'hono/vercel';
export const PATCH = handle(app);
