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
import { handle } from 'hono/vercel';
import { requireAuth } from '../../_lib/auth';
import { apiRateLimit } from '../../_lib/rateLimit';
import { createAuthenticatedClient, createServiceClient } from '../../_lib/supabaseClient';
import { sanitizeForAuditLog } from '../../_lib/sanitizeAuditData';
import { badRequest, forbidden, internalError, notFound } from '../../_lib/errorHandler';
import { applyVersionResolution } from '../../_lib/observationDomain';

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

  if (body.keep === 'student') {
    // Validate student_version_id is provided (enforced by Zod refine above)
    if (!body.student_version_id) {
      return badRequest(c, 'student_version_id is required when keep is "student"');
    }
  }

  // DDD-002: delegate restore + mark-resolved to observationDomain.applyVersionResolution
  // Maps: body.keep === 'student' -> 'accept_student', 'instructor' -> 'keep_instructor'
  const resolution = body.keep === 'student' ? 'accept_student' : 'keep_instructor';
  const studentVersionId = body.student_version_id ?? versionId;

  try {
    await applyVersionResolution(supabase, observationId, studentVersionId, resolution, auth.userId, now);
  } catch (err) {
    const message = (err as Error).message ?? '';
    if (message.toLowerCase().includes('not found')) {
      return notFound(c, message);
    }
    return internalError(c, err as Error);
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
export const GET = handle(app);
export const PATCH = handle(app);
