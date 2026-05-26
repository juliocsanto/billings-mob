import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient, createServiceClient } from '../_lib/supabaseClient';
import { badRequest, conflict, forbidden, internalError } from '../_lib/errorHandler';
import { CreateLinkSchema } from './schema';

const app = new Hono();

// Rate limiting (SEC-001)
app.use('*', apiRateLimit);
app.use('*', requireAuth);

// ─── GET /api/instructor-student-links ─────────────────────────────────────
app.get('/', async (c) => {
  const auth = c.get('auth');
  const supabase = createAuthenticatedClient(auth.jwt);

  const { data, error } = await supabase
    .from('instructor_student_links')
    .select('id, instructor_id, student_id, status, invited_at, accepted_at, revoked_at, revoked_by')
    .order('invited_at', { ascending: false });

  if (error) return internalError(c, error);

  return c.json({ data: data ?? [] });
});

// ─── POST /api/instructor-student-links ────────────────────────────────────
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

  return c.json({ data }, 201);
});

export default app;

import { handle } from 'hono/vercel';
export const GET = handle(app);
export const POST = handle(app);
