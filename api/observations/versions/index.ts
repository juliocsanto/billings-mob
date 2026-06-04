/**
 * GET  /api/observations/versions/pending — list all pending conflict versions for
 *       the authenticated instructor (across all linked students).
 * PATCH /api/observations/versions/:versionId/resolve — resolve a conflict.
 *       Instructor selects which version wins; both are preserved in history.
 *
 * ADR-004: Conflict resolution is instructor-exclusive authority.
 *   - System NEVER auto-resolves conflicts.
 *   - Instructor picks "keep my version" or "keep student version".
 *   - Resolution is recorded in observation_versions + audit_log.
 *
 * ADR-003: RLS policy "instructor_resolves_conflict" enforces that only the
 *          linked instructor can PATCH observation_versions.
 *
 * Clinical constraint (§ 3.3 ARCHITECTURE.md — inviolable):
 *   - This endpoint NEVER classifies a day as fertile or infertile.
 *   - It only records which version the instructor chose.
 *
 * LGPD: relations and notes are NEVER written to audit_log.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../../_lib/auth';
import { apiRateLimit } from '../../_lib/rateLimit';
import { createAuthenticatedClient, createServiceClient } from '../../_lib/supabaseClient';
import { sanitizeForAuditLog } from '../../_lib/sanitizeAuditData';
import { mergeVectorClocks, type VectorClock } from '../../_lib/vectorClock';
import { badRequest, forbidden, internalError, notFound } from '../../_lib/errorHandler';

const app = new Hono();

// Rate limiting (SEC-001) — before auth to limit unauthenticated probing
app.use('*', apiRateLimit);
app.use('*', requireAuth);

// ─── Schema ────────────────────────────────────────────────────────────────

const ResolveConflictSchema = z.object({
  /**
   * Which version wins:
   *   'instructor' — keep the current observation record (instructor's edit).
   *   'student'    — roll back the observation to the student's version in observation_versions.
   */
  keep: z.enum(['instructor', 'student']),
  /**
   * ID of the observation_version record that represents the student's conflicting version.
   * Required when keep === 'student' to identify which version to restore.
   */
  student_version_id: z.string().uuid().optional(),
}).refine(
  (data) => data.keep === 'instructor' || data.student_version_id !== undefined,
  {
    message: 'student_version_id is required when keep === "student"',
    path: ['student_version_id'],
  }
);

type ResolveConflictInput = z.infer<typeof ResolveConflictSchema>;

// ─── GET /api/observations/versions/pending ─────────────────────────────────
// Lists all observation_versions where conflict_resolved = false,
// scoped to the authenticated instructor's linked students.
app.get('/pending', async (c) => {
  const auth = c.get('auth');

  if (auth.role !== 'instructor') {
    return forbidden(c, 'Only instructors can view pending conflict resolutions');
  }

  const supabase = createAuthenticatedClient(auth.jwt);

  // Fetch pending conflicts across all linked students via RLS
  // The "instructor_sees_student_versions" policy filters to linked students only.
  const { data, error } = await supabase
    .from('observation_versions')
    .select(`
      id,
      observation_id,
      vector_clock,
      data,
      author_id,
      author_role,
      created_at,
      conflict_resolved,
      observations!inner (
        id,
        date,
        stamp,
        mucus,
        bleeding,
        version,
        user_id,
        cycle_id
      )
    `)
    .eq('conflict_resolved', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return internalError(c, error);
  }

  return c.json({ data: data ?? [], count: data?.length ?? 0 });
});

// ─── PATCH /api/observations/versions/:versionId/resolve ───────────────────
// Resolves a conflict on an observation_version record.
// The instructor chooses which version to preserve as the canonical record.
app.patch('/:versionId/resolve', zValidator('json', ResolveConflictSchema), async (c) => {
  const auth = c.get('auth');
  const { versionId } = c.req.param();
  const body = c.req.valid('json') as ResolveConflictInput;

  if (auth.role !== 'instructor') {
    return forbidden(c, 'Only instructors can resolve conflicts');
  }

  const supabase = createAuthenticatedClient(auth.jwt);
  const serviceClient = createServiceClient();
  const now = new Date().toISOString();

  // Fetch the conflicting version record (RLS ensures instructor is linked to this student)
  const { data: conflictVersion, error: fetchErr } = await supabase
    .from('observation_versions')
    .select('id, observation_id, stamp, mucus_type, sensation, observacao_descricao, vector_clock, created_at, created_by, observations!inner(id, stamp, mucus, bleeding, vector_clock, version, user_id)')
    .eq('id', versionId)
    .eq('conflict_resolved', false)
    .single();

  if (fetchErr || !conflictVersion) {
    return notFound(c, 'Pending conflict version not found');
  }

  const observationId = conflictVersion.observation_id as string;
  const obs = conflictVersion.observations as unknown as Record<string, unknown>;

  if (body.keep === 'student') {
    // Validate student_version_id is provided (enforced by Zod refine above)
    if (!body.student_version_id) {
      return badRequest(c, 'student_version_id is required when keep is "student"');
    }

    // Fetch the student's version to restore.
    // `data` column contains the snapshotted observation fields (no relations/notes — sanitized at write time).
    const { data: studentVersion, error: svErr } = await supabase
      .from('observation_versions')
      .select('id, observation_id, vector_clock, data, author_id, author_role, conflict_resolved, resolved_by, resolved_at, created_at')
      .eq('id', body.student_version_id)
      .eq('observation_id', observationId)
      .single();

    if (svErr || !studentVersion) {
      return notFound(c, 'Student version not found for this observation');
    }

    const studentData = studentVersion.data as Record<string, unknown>;
    const currentClock = obs.vector_clock as VectorClock;
    const studentClock = studentVersion.vector_clock as VectorClock;
    const mergedClock = mergeVectorClocks(currentClock, studentClock);

    // Restore observation to student's version data, with merged clock
    // ADR-004: instructor is the authority — restore is still an instructor action
    const { error: restoreErr } = await supabase
      .from('observations')
      .update({
        stamp: studentData.stamp,
        mucus: studentData.mucus ?? null,
        bleeding: studentData.bleeding ?? null,
        vector_clock: mergedClock,
        version: ((obs.version as number) ?? 1) + 1,
      })
      .eq('id', observationId);

    if (restoreErr) {
      return internalError(c, restoreErr);
    }
  }
  // If keep === 'instructor': the observation table already holds the instructor's version.
  // No update needed — just mark the conflict as resolved.

  // Mark the conflict version as resolved (RLS: "instructor_resolves_conflict" policy)
  const { error: resolveErr } = await supabase
    .from('observation_versions')
    .update({
      conflict_resolved: true,
      resolved_by: auth.userId,
      resolved_at: now,
    })
    .eq('id', versionId);

  if (resolveErr) {
    return internalError(c, resolveErr);
  }

  // Audit log (LGPD: no relations/notes in log)
  await serviceClient.from('audit_log').insert({
    entity_type: 'observation_versions',
    entity_id: versionId,
    action: 'CONFLICT_RESOLVED',
    actor_id: auth.userId,
    actor_role: auth.role,
    before_data: sanitizeForAuditLog({
      conflict_resolved: false,
      observation_id: observationId,
    }),
    after_data: sanitizeForAuditLog({
      conflict_resolved: true,
      resolved_by: auth.userId,
      resolved_at: now,
      kept_version: body.keep,
    }),
  });

  return c.json({
    data: {
      version_id: versionId,
      observation_id: observationId,
      conflict_resolved: true,
      resolved_by: auth.userId,
      resolved_at: now,
      kept_version: body.keep,
    },
  });
});

export default app;

// Vercel Serverless Function handler
import { handle } from 'hono/vercel';
export const GET = handle(app);
export const PATCH = handle(app);
