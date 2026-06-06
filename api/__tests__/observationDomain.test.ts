/**
 * Unit tests — observationDomain.ts
 *
 * S8-02: createObservationVersion — encapsula o insert em observation_versions
 * S8-03: applyVersionResolution — encapsula o restore de versão
 *
 * TDD: testes escritos ANTES da implementação (RED fase).
 * LGPD: relations/notes nunca em snapshots de versão (sanitizeForAuditLog).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOCK_OBS_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d482';
const MOCK_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_CYCLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d481';
const MOCK_STUDENT_VERSION_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d484';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeObservationSnapshot() {
  return {
    stamp: 'muco' as const,
    mucus: 'elastico' as const,
    bleeding: null,
    sensacao: null,
    tipo_observacao: null,
    cycle_id: MOCK_CYCLE_ID,
    version: 1,
  };
}

function makeSupabaseMock(insertResult: { error: unknown } = { error: null }) {
  const mockInsert = vi.fn().mockResolvedValue(insertResult);
  const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
  return {
    supabase: { from: mockFrom } as unknown as SupabaseClient,
    mockFrom,
    mockInsert,
  };
}

// ─── S8-02: createObservationVersion ─────────────────────────────────────────

describe('createObservationVersion', () => {
  // Import after the mock is set up
  let createObservationVersion: (
    supabase: SupabaseClient,
    observationId: string,
    currentData: ReturnType<typeof makeObservationSnapshot>,
    authorId: string,
  ) => Promise<void>;

  beforeEach(async () => {
    // Dynamic import ensures re-import on each test for module isolation
    const mod = await import('../_lib/observationDomain');
    createObservationVersion = mod.createObservationVersion;
  });

  it('inserts into observation_versions with the correct fields', async () => {
    const { supabase, mockFrom, mockInsert } = makeSupabaseMock({ error: null });
    const snapshot = makeObservationSnapshot();

    await createObservationVersion(supabase, MOCK_OBS_ID, snapshot, MOCK_USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('observation_versions');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        observation_id: MOCK_OBS_ID,
        author_id: MOCK_USER_ID,
        conflict_resolved: false,
      }),
    );
  });

  it('inserts with vector_clock from snapshot when present', async () => {
    const { supabase, mockInsert } = makeSupabaseMock({ error: null });
    const snapshot = { ...makeObservationSnapshot(), vector_clock: { [MOCK_USER_ID]: 2 } } as ReturnType<typeof makeObservationSnapshot> & { vector_clock?: Record<string, number> };

    await createObservationVersion(supabase, MOCK_OBS_ID, snapshot as ReturnType<typeof makeObservationSnapshot>, MOCK_USER_ID);

    const insertPayload = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertPayload.vector_clock).toEqual({ [MOCK_USER_ID]: 2 });
  });

  it('does NOT include relations or notes in the inserted data (LGPD)', async () => {
    const { supabase, mockInsert } = makeSupabaseMock({ error: null });
    const snapshot = {
      ...makeObservationSnapshot(),
      relations: true,
      notes: 'private clinical note',
    } as ReturnType<typeof makeObservationSnapshot> & { relations?: boolean; notes?: string };

    await createObservationVersion(supabase, MOCK_OBS_ID, snapshot as ReturnType<typeof makeObservationSnapshot>, MOCK_USER_ID);

    const insertPayload = JSON.stringify(mockInsert.mock.calls[0][0]);
    expect(insertPayload).not.toContain('"relations"');
    expect(insertPayload).not.toContain('"notes"');
    expect(insertPayload).not.toContain('private clinical note');
  });

  it('throws when Supabase returns an error', async () => {
    const dbError = new Error('DB insert failed');
    const { supabase } = makeSupabaseMock({ error: dbError });
    const snapshot = makeObservationSnapshot();

    await expect(
      createObservationVersion(supabase, MOCK_OBS_ID, snapshot, MOCK_USER_ID),
    ).rejects.toThrow('DB insert failed');
  });

  it('throws with a descriptive message when error has a message property', async () => {
    const dbError = { message: 'constraint violation', code: '23505' };
    const { supabase } = makeSupabaseMock({ error: dbError });
    const snapshot = makeObservationSnapshot();

    await expect(
      createObservationVersion(supabase, MOCK_OBS_ID, snapshot, MOCK_USER_ID),
    ).rejects.toThrow();
  });
});

// ─── S8-03: applyVersionResolution ───────────────────────────────────────────

describe('applyVersionResolution', () => {
  let applyVersionResolution: (
    supabase: SupabaseClient,
    observationId: string,
    studentVersionId: string,
    resolution: 'accept_student' | 'keep_instructor',
    authorId: string,
    now?: string,
  ) => Promise<void>;

  beforeEach(async () => {
    const mod = await import('../_lib/observationDomain');
    applyVersionResolution = mod.applyVersionResolution;
  });

  // Helper: builds a supabase mock with configurable per-call behavior.
  // For 'accept_student', the call order is:
  //   1. observation_versions.select (fetch student version)
  //   2. observations.update (restore observation)
  //   3. observation_versions.update (mark resolved)
  // For 'keep_instructor', the call order is:
  //   1. observation_versions.update (mark resolved) — no fetch, no restore
  function makeResolveMock(config: {
    studentVersionData?: Record<string, unknown> | null;
    studentVersionError?: unknown;
    updateObsError?: unknown;
    markResolvedError?: unknown;
    resolution?: 'accept_student' | 'keep_instructor';
  } = {}) {
    const resolution = config.resolution ?? 'accept_student';

    const mockSingleStudentVersion = vi.fn().mockResolvedValue({
      data: config.studentVersionData !== undefined
        ? config.studentVersionData
        : {
          id: MOCK_STUDENT_VERSION_ID,
          observation_id: MOCK_OBS_ID,
          vector_clock: { [MOCK_USER_ID]: 1 },
          data: {
            stamp: 'sangramento',
            mucus: null,
            bleeding: 'leve',
            sensacao: null,
            tipo_observacao: null,
            cycle_id: MOCK_CYCLE_ID,
            version: 1,
          },
          author_id: MOCK_USER_ID,
          author_role: 'student',
          conflict_resolved: false,
          resolved_by: null,
          resolved_at: null,
          created_at: '2026-06-06T00:00:00Z',
        },
      error: config.studentVersionError ?? null,
    });

    // observation_versions fetch chain (accept_student only)
    const fetchVersionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingleStudentVersion,
    };

    // observations table update mock
    const mockUpdateObsEq = vi.fn().mockResolvedValue({ error: config.updateObsError ?? null });
    const obsTableChain = {
      update: vi.fn().mockReturnValue({ eq: mockUpdateObsEq }),
    };

    // observation_versions update (mark resolved)
    const mockMarkResolvedEq = vi.fn().mockResolvedValue({ error: config.markResolvedError ?? null });
    const markResolvedChain = {
      update: vi.fn().mockReturnValue({ eq: mockMarkResolvedEq }),
    };

    // Track observation_versions calls separately
    let obsVersionsCallCount = 0;
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'observation_versions') {
        obsVersionsCallCount++;
        // accept_student: first call is fetch, subsequent are mark-resolved
        // keep_instructor: all calls are mark-resolved (no fetch)
        if (resolution === 'accept_student' && obsVersionsCallCount === 1) {
          return fetchVersionChain;
        }
        return markResolvedChain;
      }
      if (table === 'observations') {
        return obsTableChain;
      }
      return markResolvedChain;
    });

    return {
      supabase: { from: mockFrom } as unknown as SupabaseClient,
      mockFrom,
      mockUpdateObsEq,
      mockMarkResolvedEq,
      fetchVersionChain,
    };
  }

  it('accept_student: fetches student version and updates observations with snapshot data', async () => {
    const { supabase, mockUpdateObsEq } = makeResolveMock({ resolution: 'accept_student' });

    await applyVersionResolution(supabase, MOCK_OBS_ID, MOCK_STUDENT_VERSION_ID, 'accept_student', MOCK_USER_ID);

    // Should have updated observations table with student snapshot data
    expect(mockUpdateObsEq).toHaveBeenCalledWith('id', MOCK_OBS_ID);
  });

  it('accept_student: marks the student version as conflict_resolved=true', async () => {
    const { supabase, mockMarkResolvedEq } = makeResolveMock({ resolution: 'accept_student' });

    await applyVersionResolution(supabase, MOCK_OBS_ID, MOCK_STUDENT_VERSION_ID, 'accept_student', MOCK_USER_ID);

    expect(mockMarkResolvedEq).toHaveBeenCalledWith('id', MOCK_STUDENT_VERSION_ID);
  });

  it('keep_instructor: does NOT update observations table', async () => {
    const { supabase, mockUpdateObsEq } = makeResolveMock({ resolution: 'keep_instructor' });

    await applyVersionResolution(supabase, MOCK_OBS_ID, MOCK_STUDENT_VERSION_ID, 'keep_instructor', MOCK_USER_ID);

    // observations table should not be updated when keeping instructor version
    expect(mockUpdateObsEq).not.toHaveBeenCalled();
  });

  it('keep_instructor: marks the version as conflict_resolved=true', async () => {
    const { supabase, mockMarkResolvedEq } = makeResolveMock({ resolution: 'keep_instructor' });

    await applyVersionResolution(supabase, MOCK_OBS_ID, MOCK_STUDENT_VERSION_ID, 'keep_instructor', MOCK_USER_ID);

    expect(mockMarkResolvedEq).toHaveBeenCalledWith('id', MOCK_STUDENT_VERSION_ID);
  });

  it('throws when student version is not found (accept_student)', async () => {
    const { supabase } = makeResolveMock({
      resolution: 'accept_student',
      studentVersionData: null,
      studentVersionError: { code: 'PGRST116', message: 'Row not found' },
    });

    await expect(
      applyVersionResolution(supabase, MOCK_OBS_ID, MOCK_STUDENT_VERSION_ID, 'accept_student', MOCK_USER_ID),
    ).rejects.toThrow();
  });

  it('throws when updating observations fails (accept_student)', async () => {
    const { supabase } = makeResolveMock({
      resolution: 'accept_student',
      updateObsError: new Error('Update failed'),
    });

    await expect(
      applyVersionResolution(supabase, MOCK_OBS_ID, MOCK_STUDENT_VERSION_ID, 'accept_student', MOCK_USER_ID),
    ).rejects.toThrow('Update failed');
  });

  it('throws when marking version resolved fails (keep_instructor)', async () => {
    const { supabase } = makeResolveMock({
      resolution: 'keep_instructor',
      markResolvedError: new Error('Mark resolved failed'),
    });

    await expect(
      applyVersionResolution(supabase, MOCK_OBS_ID, MOCK_STUDENT_VERSION_ID, 'keep_instructor', MOCK_USER_ID),
    ).rejects.toThrow('Mark resolved failed');
  });
});
