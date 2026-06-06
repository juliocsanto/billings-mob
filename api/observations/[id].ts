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
import { handle } from 'hono/vercel';
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
import { PatchObservationSchema, OBSERVATION_SELECT_COLUMNS } from './schema';
import { createObservationVersion } from '../_lib/observationDomain';
import type { SupabaseClient } from '@supabase/supabase-js';

const app = new Hono();

// Rate limiting (SEC-001) — before auth to limit unauthenticated probing
app.use('*', apiRateLimit);
// All routes require authentication
app.use('*', requireAuth);

// ─── Helpers ───────────────────────────────────────────────────────────────

type AuthContext = { userId: string; role: string };

/**
 * CC-001: Writes an observation update to the audit log (LGPD-safe).
 */
async function writeObservationAuditLog(
  serviceClient: SupabaseClient,
  params: {
    observationId: string;
    isConflict: boolean;
    auth: AuthContext;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  },
): Promise<void> {
  const action = params.isConflict ? 'CONFLICT_DETECTED' : 'UPDATE';
  await serviceClient.from('audit_log').insert({
    entity_type: 'observations',
    entity_id: params.observationId,
    action,
    actor_id: params.auth.userId,
    actor_role: params.auth.role,
    before_data: sanitizeForAuditLog({
      stamp: params.before.stamp,
      mucus: params.before.mucus,
      bleeding: params.before.bleeding,
      sensacao: params.before.sensacao,
      tipo_observacao: params.before.tipo_observacao,
      version: params.before.version,
    }),
    after_data: sanitizeForAuditLog({
      stamp: params.after.stamp,
      mucus: params.after.mucus,
      bleeding: params.after.bleeding,
      sensacao: params.after.sensacao,
      tipo_observacao: params.after.tipo_observacao,
      version: params.after.version,
    }),
  });
}

// ─── GET /api/observations/:id ─────────────────────────────────────────────
app.get('/:id', async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const supabase = createAuthenticatedClient(auth.jwt);

  const { data: observation, error: obsError } = await supabase
    .from('observations')
    .select(OBSERVATION_SELECT_COLUMNS)
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
    .select(OBSERVATION_SELECT_COLUMNS)
    .eq('id', id)
    .single();

  if (fetchError) return internalError(c, fetchError);
  if (!current) return notFound(c, 'Observation not found');

  const currentClock = (current.vector_clock ?? {}) as VectorClock;
  const newClock = incrementVectorClock(currentClock, auth.userId);

  // ADR-004: compare client clock vs DB clock — see vectorClock.detectConflict
  const clientClock = body.client_vector_clock as VectorClock | undefined;
  const isConflict = clientClock !== undefined
    ? detectConflict(clientClock, currentClock)
    : false;

  // Save snapshot of current version BEFORE applying the edit (ADR-004)
  // DDD-001: delegated to observationDomain.createObservationVersion (aggregate boundary)
  try {
    await createObservationVersion(
      supabase,
      id,
      current as unknown as Parameters<typeof createObservationVersion>[2],
      auth.userId,
    );
  } catch (versionError) {
    return internalError(c, versionError as Error);
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
  await writeObservationAuditLog(serviceClient, {
    observationId: id,
    isConflict,
    auth,
    before: current as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
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
export const GET = handle(app);
export const PATCH = handle(app);
