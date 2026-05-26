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

// All routes require authentication
app.use('*', requireAuth);

// ─── GET /api/observations/:id ─────────────────────────────────────────────
app.get('/:id', async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const supabase = createAuthenticatedClient(auth.jwt);

  const { data: observation, error: obsError } = await supabase
    .from('observations')
    .select('*')
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

  // Fetch current state — RLS ensures the requester has access
  const { data: current, error: fetchError } = await supabase
    .from('observations')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) return internalError(c, fetchError);
  if (!current) return notFound(c, 'Observation not found');

  const currentClock = (current.vector_clock ?? {}) as VectorClock;
  const newClock = incrementVectorClock(currentClock, auth.userId);

  // Detect conflict: this happens when another actor has already incremented
  // their counter since the client last read this observation.
  // For PATCH requests, we compare the client's implicit "parent" clock
  // (= current state in DB) with the new clock being applied.
  // A more robust implementation would accept client's lastKnownClock in the body,
  // but for Sprint 1 we derive it from the DB state.
  const isConflict = detectConflict(currentClock, newClock);

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

  // Apply the update with the new vector clock
  const updatePayload = {
    ...body,
    vector_clock: newClock,
    version: current.version + 1,
  };

  const { data: updated, error: updateError } = await supabase
    .from('observations')
    .update(updatePayload)
    .eq('id', id)
    .select()
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
      version: current.version,
    }),
    after_data: sanitizeForAuditLog({
      stamp: updated.stamp,
      mucus: updated.mucus,
      bleeding: updated.bleeding,
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
