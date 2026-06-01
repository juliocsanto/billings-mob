/**
 * GET /api/observations — list observations for the authenticated user.
 * POST /api/observations — create a new observation.
 *
 * Vercel Serverless Function (Node.js runtime, Hono.js handler).
 * ADR-002: Hono.js + TypeScript
 * ADR-003: Supabase RLS enforces data isolation
 * ADR-004: Vector clock initialized on creation
 * ADR-005: Requires Supabase JWT in Authorization header
 *
 * LGPD: relations and notes are never written to audit_log.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient, createServiceClient } from '../_lib/supabaseClient';
import { sanitizeForAuditLog } from '../_lib/sanitizeAuditData';
import { incrementVectorClock } from '../_lib/vectorClock';
import {
  badRequest,
  conflict,
  internalError,
} from '../_lib/errorHandler';
import {
  CreateObservationSchema,
  ListObservationsQuerySchema,
} from './schema';
import { getNotificationService } from '../_lib/notifications/factory';

const app = new Hono();

// Rate limiting (SEC-001) — applied before auth to limit unauthenticated brute-force too
app.use('*', apiRateLimit);
// All routes require authentication
app.use('*', requireAuth);

// ─── GET /api/observations ─────────────────────────────────────────────────
app.get('/', zValidator('query', ListObservationsQuerySchema), async (c) => {
  const auth = c.get('auth');
  const query = c.req.valid('query');
  const supabase = createAuthenticatedClient(auth.jwt);

  let dbQuery = supabase
    .from('observations')
    .select(`
      id,
      date,
      stamp,
      mucus,
      bleeding,
      sensacao,
      tipo_observacao,
      relations,
      notes,
      vector_clock,
      version,
      cycle_id,
      created_at,
      updated_at
    `)
    .order('date', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (query.cycle_id) {
    dbQuery = dbQuery.eq('cycle_id', query.cycle_id);
  }
  if (query.from) {
    dbQuery = dbQuery.gte('date', query.from);
  }
  if (query.to) {
    dbQuery = dbQuery.lte('date', query.to);
  }

  const { data, error } = await dbQuery;

  if (error) {
    return internalError(c, error);
  }

  return c.json({ data: data ?? [], count: data?.length ?? 0 });
});

// ─── POST /api/observations ────────────────────────────────────────────────
app.post('/', zValidator('json', CreateObservationSchema), async (c) => {
  const auth = c.get('auth');
  const body = c.req.valid('json');
  const supabase = createAuthenticatedClient(auth.jwt);
  const serviceClient = createServiceClient();

  // Initialize vector clock with the creating user
  const vectorClock = incrementVectorClock({}, auth.userId);

  const observationData = {
    user_id: auth.userId,
    date: body.date,
    stamp: body.stamp,
    mucus: body.mucus ?? null,
    bleeding: body.bleeding ?? null,
    sensacao: body.sensacao ?? null,
    tipo_observacao: body.tipo_observacao ?? null,
    relations: body.relations,
    notes: body.notes ?? '',
    vector_clock: vectorClock,
    version: 1,
    cycle_id: body.cycle_id ?? null,
  };

  const { data, error } = await supabase
    .from('observations')
    .insert(observationData)
    .select()
    .single();

  if (error) {
    // PostgreSQL unique violation: unique_obs_per_day constraint
    if (error.code === '23505') {
      return conflict(c, `An observation already exists for date ${body.date}`);
    }
    // PostgreSQL check violation: stamp constraint or no_future_obs
    if (error.code === '23514') {
      return badRequest(c, 'Invalid observation data: check constraint violation');
    }
    return internalError(c, error);
  }

  if (!data) {
    return internalError(c, new Error('Insert succeeded but no data returned'));
  }

  // Notify instructor via NotificationService (ADR-012)
  // Fire-and-forget: notification failures must never interrupt clinical operations.
  void (async () => {
    try {
      const { data: activeLink } = await serviceClient
        .from('instructor_student_links')
        .select('instructor_id')
        .eq('student_id', auth.userId)
        .eq('status', 'active')
        .single();

      if (activeLink?.instructor_id) {
        const notificationService = getNotificationService();
        await notificationService.dispatch({
          type: 'new_observation',
          recipientId: activeLink.instructor_id as string,
          entityId: data.id as string,
          metadata: { date: data.date as string },
        });
      }
    } catch {
      // Intentionally swallowed — notification must not affect clinical write
    }
  })();

  // Write audit log (service role bypasses RLS — audit_log has no SELECT policy for users)
  // LGPD: sanitize before logging — strip relations and notes
  await serviceClient.from('audit_log').insert({
    entity_type: 'observations',
    entity_id: data.id,
    action: 'INSERT',
    actor_id: auth.userId,
    actor_role: auth.role,
    before_data: null,
    after_data: sanitizeForAuditLog({
      stamp: data.stamp,
      mucus: data.mucus,
      bleeding: data.bleeding,
      sensacao: data.sensacao,
      tipo_observacao: data.tipo_observacao,
      version: data.version,
      cycle_id: data.cycle_id,
    }),
  });

  return c.json({ data }, 201);
});

export default app;

// Vercel Serverless Function handler (ADR-002: Vercel + Hono.js)
// The `handle` adapter bridges Hono's fetch-based interface to Vercel's Node.js runtime.
import { handle } from 'hono/vercel';
export const GET = handle(app);
export const POST = handle(app);
