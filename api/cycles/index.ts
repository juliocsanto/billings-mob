/**
 * GET /api/cycles — list cycles for the authenticated user.
 * POST /api/cycles — create a new cycle.
 * GET /api/cycles/:id — get a cycle with its observations.
 * PATCH /api/cycles/:id — update cycle (end_date, apex_date, status).
 *
 * ADR-002: Hono.js + TypeScript
 * ADR-003: Supabase RLS — student sees own cycles; instructor sees linked students'.
 * ADR-005: Supabase Auth JWT required.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient, createServiceClient } from '../_lib/supabaseClient';
import { badRequest, internalError, notFound } from '../_lib/errorHandler';
import { CreateCycleSchema, PatchCycleSchema } from '../_lib/schemas/cycleSchemas';

const app = new Hono();
// Rate limiting (SEC-001)
app.use('*', apiRateLimit);
app.use('*', requireAuth);

// ─── GET /api/cycles ────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const auth = c.get('auth');
  const supabase = createAuthenticatedClient(auth.jwt);

  const { data, error } = await supabase
    .from('cycles')
    .select('id, start_date, end_date, apex_date, status, created_at, updated_at')
    .order('start_date', { ascending: false })
    .limit(24); // max 2 years of cycles

  if (error) return internalError(c, error);

  return c.json({ data: data ?? [] });
});

// ─── POST /api/cycles ───────────────────────────────────────────────────────
app.post('/', zValidator('json', CreateCycleSchema), async (c) => {
  const auth = c.get('auth');
  const body = c.req.valid('json');
  const supabase = createAuthenticatedClient(auth.jwt);
  const serviceClient = createServiceClient();

  const { data, error } = await supabase
    .from('cycles')
    .insert({
      user_id: auth.userId,
      start_date: body.start_date,
      end_date: body.end_date ?? null,
      apex_date: body.apex_date ?? null,
      status: 'active',
    })
    .select('id, user_id, start_date, end_date, apex_date, status, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === '23514') {
      return badRequest(c, 'Invalid cycle dates: check date range constraints');
    }
    return internalError(c, error);
  }

  if (!data) return internalError(c, new Error('Insert succeeded but no data returned'));

  await serviceClient.from('audit_log').insert({
    entity_type: 'cycles',
    entity_id: data.id,
    action: 'INSERT',
    actor_id: auth.userId,
    actor_role: auth.role,
    before_data: null,
    after_data: { start_date: data.start_date, status: data.status },
  });

  return c.json({ data }, 201);
});

// ─── GET /api/cycles/:id ────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const supabase = createAuthenticatedClient(auth.jwt);

  // LGPD: relations and notes are sensitive fields — excluded from nested select.
  // Callers that need those fields for the authenticated user must use
  // GET /api/observations?cycle_id=:id directly.
  const { data: cycle, error } = await supabase
    .from('cycles')
    .select(`
      id, start_date, end_date, apex_date, status, created_at, updated_at,
      observations (
        id, date, stamp, mucus, bleeding,
        vector_clock, version, created_at, updated_at
      )
    `)
    .eq('id', id)
    .single();

  if (error) return internalError(c, error);
  if (!cycle) return notFound(c, 'Cycle not found');

  return c.json({ data: cycle });
});

// ─── PATCH /api/cycles/:id ──────────────────────────────────────────────────
app.patch('/:id', zValidator('json', PatchCycleSchema), async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const body = c.req.valid('json');
  const supabase = createAuthenticatedClient(auth.jwt);
  const serviceClient = createServiceClient();

  const { data: current, error: fetchErr } = await supabase
    .from('cycles')
    .select('id, user_id, start_date, end_date, apex_date, status, cycle_number, created_at, updated_at')
    .eq('id', id)
    .single();

  if (fetchErr) return internalError(c, fetchErr);
  if (!current) return notFound(c, 'Cycle not found');

  const { data: updated, error: updateErr } = await supabase
    .from('cycles')
    .update(body)
    .eq('id', id)
    .select('id, user_id, start_date, end_date, apex_date, status, created_at, updated_at')
    .single();

  if (updateErr || !updated) return internalError(c, updateErr);

  await serviceClient.from('audit_log').insert({
    entity_type: 'cycles',
    entity_id: id,
    action: 'UPDATE',
    actor_id: auth.userId,
    actor_role: auth.role,
    before_data: {
      end_date: current.end_date,
      apex_date: current.apex_date,
      status: current.status,
    },
    after_data: {
      end_date: updated.end_date,
      apex_date: updated.apex_date,
      status: updated.status,
    },
  });

  return c.json({ data: updated });
});

export default app;

// Vercel Serverless Function handler
import { handle } from 'hono/vercel';
export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
