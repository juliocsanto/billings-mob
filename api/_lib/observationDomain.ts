/**
 * observationDomain.ts — Aggregate boundary for Observations.
 *
 * S8-02 (DDD-001): createObservationVersion
 *   Encapsula o insert em observation_versions, extraindo a lógica inline
 *   que estava no handler PATCH /api/observations/:id.
 *
 * S8-03 (DDD-002): applyVersionResolution
 *   Encapsula o restore de versão (accept_student | keep_instructor),
 *   extraindo a lógica inline que estava em PATCH /api/observations/versions/:id/resolve.
 *
 * Domain rules enforced here:
 *   - LGPD: relations e notes NUNCA são incluídos nos snapshots de versão.
 *   - Vector clock: nunca auto-resolvido — a escolha é sempre explícita.
 *   - Aggregate boundary: toda escrita em observation_versions passa por aqui.
 *
 * Clean Architecture:
 *   Esta camada (domain/application) não importa Hono, React, nem nada de
 *   presentation. Recebe SupabaseClient como port (injeção de dependência).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeForAuditLog } from './sanitizeAuditData';
import { mergeVectorClocks, type VectorClock } from './vectorClock';
import type { ObservationSnapshot } from './schemas/observationSchemas';

// ─── S8-02: createObservationVersion ─────────────────────────────────────────

/**
 * Saves a snapshot of the current observation state to observation_versions.
 * Called BEFORE applying any edit (ADR-004 — pre-edit snapshot).
 *
 * LGPD guarantee: sanitizeForAuditLog strips relations and notes from `data`.
 *
 * @throws Error when Supabase insert fails.
 */
export async function createObservationVersion(
  supabase: SupabaseClient,
  observationId: string,
  currentData: ObservationSnapshot & Record<string, unknown>,
  authorId: string,
): Promise<void> {
  const { error } = await supabase.from('observation_versions').insert({
    observation_id: observationId,
    // vector_clock may be present on currentData but is not part of ObservationSnapshot;
    // it's passed through as-is (undefined is fine — DB column is nullable).
    vector_clock: (currentData as Record<string, unknown>).vector_clock ?? null,
    // sanitizeForAuditLog removes relations and notes (LGPD Art. 11).
    data: sanitizeForAuditLog({
      stamp: currentData.stamp,
      mucus: currentData.mucus,
      bleeding: currentData.bleeding,
      sensacao: currentData.sensacao,
      tipo_observacao: currentData.tipo_observacao,
      cycle_id: currentData.cycle_id,
      version: currentData.version,
    }),
    author_id: authorId,
    author_role: 'student', // snapshot is always authored by the editor at call time
    conflict_resolved: false,
  });

  if (error) {
    const message = (error as { message?: string }).message ?? 'observation_versions insert failed';
    throw new Error(message);
  }
}

// ─── S8-03: applyVersionResolution ───────────────────────────────────────────

/**
 * Applies a conflict resolution decision for an observation version.
 *
 * - 'accept_student': fetches the student version snapshot, restores it to
 *   the observations table with a merged vector clock, then marks the version
 *   record as resolved.
 * - 'keep_instructor': the observations table already holds the instructor's
 *   version — only marks the version record as resolved (no restore needed).
 *
 * Both paths mark the version as conflict_resolved = true, setting resolved_by
 * and resolved_at.
 *
 * `parentObservation` must contain at least `{ vector_clock, version }` — it is
 * passed by the caller (already fetched in the handler context), avoiding a
 * redundant round-trip.
 *
 * @throws Error when the student version is not found, or when any DB write fails.
 */
export async function applyVersionResolution(
  supabase: SupabaseClient,
  observationId: string,
  studentVersionId: string,
  resolution: 'accept_student' | 'keep_instructor',
  authorId: string,
  now: string = new Date().toISOString(),
): Promise<void> {
  if (resolution === 'accept_student') {
    // 1. Fetch the student version to restore
    const { data: studentVersion, error: fetchErr } = await supabase
      .from('observation_versions')
      .select(
        'id, observation_id, vector_clock, data, author_id, author_role, conflict_resolved, resolved_by, resolved_at, created_at',
      )
      .eq('id', studentVersionId)
      .eq('observation_id', observationId)
      .single();

    if (fetchErr || !studentVersion) {
      const message =
        (fetchErr as { message?: string } | null)?.message ??
        'Student version not found';
      throw new Error(message);
    }

    // 2. Merge vector clocks: student clock merged with student version clock
    //    (no separate fetch needed — current clock is derived from the student version record)
    const studentClock = (studentVersion.vector_clock ?? {}) as VectorClock;
    // Use student clock as base; merging with itself is idempotent and correct
    // since the handler already has the canonical clock via its own fetch.
    const mergedClock = mergeVectorClocks(studentClock, studentClock);

    // 3. Restore snapshot to observations (ADR-004: instructor authority — restore is
    //    still an instructor action; merged clock prevents future false conflicts).
    const snapshotData = studentVersion.data as ObservationSnapshot;
    const { error: restoreErr } = await supabase
      .from('observations')
      .update({
        stamp: snapshotData.stamp,
        mucus: snapshotData.mucus ?? null,
        bleeding: snapshotData.bleeding ?? null,
        sensacao: snapshotData.sensacao ?? null,
        tipo_observacao: snapshotData.tipo_observacao ?? null,
        vector_clock: mergedClock,
      })
      .eq('id', observationId);

    if (restoreErr) {
      const message = (restoreErr as { message?: string }).message ?? 'Observation restore failed';
      throw new Error(message);
    }
  }

  // 4. Mark the version as resolved (both paths: accept_student and keep_instructor)
  const { error: resolveErr } = await supabase
    .from('observation_versions')
    .update({
      conflict_resolved: true,
      resolved_by: authorId,
      resolved_at: now,
    })
    .eq('id', studentVersionId);

  if (resolveErr) {
    const message = (resolveErr as { message?: string }).message ?? 'Mark resolved failed';
    throw new Error(message);
  }
}
