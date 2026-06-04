/**
 * GET /api/observations/:id — get a single observation with version history.
 * PATCH /api/observations/:id — update an observation (creates new version).
 *
 * ADR-004: Every edit creates a new observation_version record.
 *          Vector clock conflict detection is applied on PATCH.
 *          Instructor authority: if conflict, instructor version wins in observations table,
 *          but both versions are preserved in observation_versions.
 *
 * ADR-003: RLS ensures student only sees own observations;
 *          instructor only sees observations of linked students.
 *
 * LGPD: relations and notes are NEVER written to audit_log.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient, createServiceClient } from '../_lib/supabaseClient';
import { sanitizeForAuditLog } from '../_lib/sanitizeAuditData';
import {
  incrementVectorClock,
  detectConflict,
  type VectorClock,
} from '../_lib/vectorClock';
import {
  internalError,
  notFound,
} from '../_lib/errorHandler';
import { PatchObservationSchema } from './schema';

const app = new Hono();

// Rate limiting (SEC-001) — before auth to limit unauthenticated probing
app.use('*', apiRateLimit);
// All routes require authentication
app.use('*', requireAuth);

// ─── GET /api/observations/:id ─────────────────────────────────────────────
app.get('/:id', async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const supabase = createAuthenticatedClient(auth.jwt);

  const { data: observation, error: obsError } = await supabase
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
    .eq('id', id)
    .single();

  if (obsError) return internalError(c, obsError);
  if (!observation) return notFound(c, 'Observation not found');

  // Fetch version history
  const { data: versions, error: versionsError } = await supabase
    .from('observation_versions')
    .select(`
      id,
      vector_clock,
      data,
      author_id,
      author_role,
      created_at,
      conflict_resolved,
      resolved_by,
      resolved_at
    `)
    .eq('observation_id', id)
    .order('created_at', { ascending: true });

  if (versionsError) {
    return internalError(c, versionsError);
  }

  return c.json({
    data: {
      ...observation,
      versions: versions ?? [],
    },
  });
});

// ─── PATCH /api/observations/:id ───────────────────────────────────────────
app.patch('/:id', zValidator('json', PatchObservationSchema), async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const body = c.req.valid('json');
  const supabase = createAuthenticatedClient(auth.jwt);
  const serviceClient = createServiceClient();

  // Fetch current state — RLS ensures the requester has access.
  // Explicit column list: relations and notes are needed here because the PATCH
  // payload may include them, and the version snapshot must preserve them.
  const { data: current, error: fetchError } = await supabase
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
    .eq('id', id)
    .single();

  if (fetchError) return internalError(c, fetchError);
  if (!current) return notFound(c, 'Observation not found');

  const currentClock = (current.vector_clock ?? {}) as VectorClock;
  const newClock = incrementVectorClock(currentClock, auth.userId);

  // Detect conflict (ARCH-001 + CODE-001 fix):
  // Compare the client's last-known clock (sent in body as client_vector_clock)
  // against the current clock in the DB.
  // If the DB clock has advanced beyond what the client knew, another actor
  // has edited this record concurrently — that is a real conflict.
  // If client_vector_clock is not provided, skip conflict detection (backward-compatible).
  const clientClock = body.client_vector_clock as VectorClock | undefined;
  const isConflict = clientClock !== undefined
    ? detectConflict(clientClock, currentClock)
    : false;

  // Save snapshot of current version BEFORE applying the edit (ADR-004)
  const { error: versionError } = await supabase
    .from('observation_versions')
    .insert({
      observation_id: id,
      vector_clock: currentClock,
      data: sanitizeForAuditLog({
        stamp: current.stamp,
        mucus: current.mucus,
        bleeding: current.bleeding,
        sensacao: current.sensacao,
        tipo_observacao: current.tipo_observacao,
        cycle_id: current.cycle_id,
        version: current.version,
      }),
      author_id: auth.userId,
      author_role: auth.role,
      conflict_resolved: false,
    });

  if (versionError) {
    return internalError(c, versionError);
  }

  // Apply the update with the new vector clock.
  // Exclude client_vector_clock — it is a request hint, not a DB column.
  const { client_vector_clock: _clientClock, ...domainFields } = body;
  const updatePayload = {
    ...domainFields,
    vector_clock: newClock,
    version: current.version + 1,
  };

  const { data: updated, error: updateError } = await supabase
    .from('observations')
    .update(updatePayload)
    .eq('id', id)
    .select('id, cycle_id, user_id, date, stamp, mucus, bleeding, sensacao, tipo_observacao, relations, notes, vector_clock, version, created_at, updated_at')
    .single();

  if (updateError || !updated) {
    return internalError(c, updateError ?? new Error('Update returned no data'));
  }

  // Audit log (service role — LGPD: sanitize before logging)
  const auditAction = isConflict ? 'CONFLICT_DETECTED' : 'UPDATE';
  await serviceClient.from('audit_log').insert({
    entity_type: 'observations',
    entity_id: id,
    action: auditAction,
    actor_id: auth.userId,
    actor_role: auth.role,
    before_data: sanitizeForAuditLog({
      stamp: current.stamp,
      mucus: current.mucus,
      bleeding: current.bleeding,
      sensacao: current.sensacao,
      tipo_observacao: current.tipo_observacao,
      version: current.version,
    }),
    after_data: sanitizeForAuditLog({
      stamp: updated.stamp,
      mucus: updated.mucus,
      bleeding: updated.bleeding,
      sensacao: updated.sensacao,
      tipo_observacao: updated.tipo_observacao,
      version: updated.version,
    }),
  });

  return c.json({
    data: updated,
    conflict_detected: isConflict,
    ...(isConflict && {
      conflict_message:
        'A concurrent edit was detected. The version history has been preserved. ' +
        'The instructor should review and resolve the conflict in the dashboard.',
    }),
  });
});

export default app;

// Vercel Serverless Function handler
import { handle } from 'hono/vercel';
export const GET = handle(app);
export const PATCH = handle(app);
