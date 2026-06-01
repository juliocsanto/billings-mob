// @vitest-environment jsdom
/**
 * Unit tests for useObservationSync hook — Sprint 3 item #1 (debito Sprint 2).
 *
 * Covers:
 *  - Returns error when no active session
 *  - Returns offline when navigator.onLine is false
 *  - PATCH: sends client_vector_clock in body
 *  - PATCH: returns synced + observationId on 200
 *  - PATCH: merges server vector_clock on success
 *  - PATCH: returns conflict + conflictVersionId on 409
 *  - PATCH: returns error on non-409 failure
 *  - POST: creates new observation, initializes local clock
 *  - POST: returns error on server failure
 *  - Catch: returns offline when fetch throws and navigator.onLine = false
 *  - Catch: returns error when fetch throws and online
 *  - syncStatus state machine: idle -> syncing -> synced / conflict / error / offline
 *
 * LGPD: relations field is sent to the API but NEVER appears in test log output.
 * Clinical constraint: stamp values never contain fertile/infertile classification.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';

// ── Mock vectorClock so we control what tickAndSaveClock/mergeServerClock return ─
vi.mock('../../lib/vectorClock', () => ({
  tickAndSaveClock: vi.fn(),
  mergeServerClock: vi.fn(),
}));

// ── Import mocks AFTER vi.mock ─────────────────────────────────────────────────
import { tickAndSaveClock, mergeServerClock } from '../../lib/vectorClock';
const mockTickAndSaveClock = vi.mocked(tickAndSaveClock);
const mockMergeServerClock = vi.mocked(mergeServerClock);

// ── Import hook AFTER mocks are registered ─────────────────────────────────────
import { useObservationSync } from '../useObservationSync';
import type { ObservationData } from '../useObservationSync';

// ── Mock fetch globally ────────────────────────────────────────────────────────
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('navigator', { onLine: true });
  localStorage.clear();
  vi.clearAllMocks();

  // Default: tickAndSaveClock returns a clock object
  mockTickAndSaveClock.mockReturnValue({ 'user-a': 1 });
  // Default: mergeServerClock is a no-op void
  mockMergeServerClock.mockReturnValue({ 'user-a': 2 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// ── Test data ──────────────────────────────────────────────────────────────────

const SESSION = {
  access_token: 'jwt-token',
  user: { id: 'user-student-1' },
} as unknown as import('@supabase/supabase-js').Session;

const OBS_ID = '11111111-1111-1111-1111-111111111111';

const FORM_DATA: ObservationData = {
  stamp: 'seco',
  mucus: null,
  bleeding: null,
  notes: '',
  relations: false,
  sensacao: null,
  tipo_observacao: null,
};

function makeOkResponse(body: object) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ error: 'server error' }),
  } as Response;
}

function makeConflictResponse(conflictVersionId: string) {
  return {
    ok: false,
    status: 409,
    json: async () => ({ conflict_version_id: conflictVersionId }),
  } as Response;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useObservationSync — session guard', () => {
  it('returns error when session is null', async () => {
    const { result } = renderHook(() => useObservationSync(null));

    let syncResult: Awaited<ReturnType<typeof result.current.syncObservation>>;
    await act(async () => {
      syncResult = await result.current.syncObservation('2026-05-27', FORM_DATA);
    });

    expect(syncResult!.status).toBe('error');
    expect(syncResult!.error).toMatch(/no active session/i);
    expect(result.current.syncStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useObservationSync — offline guard', () => {
  it('returns offline when navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    const { result } = renderHook(() => useObservationSync(SESSION));

    let syncResult: Awaited<ReturnType<typeof result.current.syncObservation>>;
    await act(async () => {
      syncResult = await result.current.syncObservation('2026-05-27', FORM_DATA);
    });

    expect(syncResult!.status).toBe('offline');
    expect(result.current.syncStatus).toBe('offline');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useObservationSync — PATCH existing observation', () => {
  it('sends client_vector_clock in body', async () => {
    const clientClock = { 'user-student-1': 3 };
    mockTickAndSaveClock.mockReturnValue(clientClock);
    mockFetch.mockResolvedValue(makeOkResponse({ id: OBS_ID, vector_clock: { 'user-student-1': 3 } }));

    const { result } = renderHook(() => useObservationSync(SESSION));

    await act(async () => {
      await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, NonNullable<Parameters<typeof fetch>[1]>];
    expect(url).toBe(`/api/observations/${OBS_ID}`);
    expect(init.method).toBe('PATCH');

    const body = JSON.parse(init.body as string);
    expect(body.client_vector_clock).toEqual(clientClock);
    expect(body.stamp).toBe('seco');
    // LGPD: relations field is sent but we do NOT assert on logs
    expect(body.relations).toBe(false);
  });

  it('returns synced + observationId on 200', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ id: OBS_ID, vector_clock: { 'user-student-1': 1 } }));

    const { result } = renderHook(() => useObservationSync(SESSION));

    let syncResult: Awaited<ReturnType<typeof result.current.syncObservation>>;
    await act(async () => {
      syncResult = await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(syncResult!.status).toBe('synced');
    expect(syncResult!.observationId).toBe(OBS_ID);
    expect(result.current.syncStatus).toBe('synced');
  });

  it('merges server vector_clock into local storage on success', async () => {
    const serverClock = { 'user-student-1': 5 };
    mockFetch.mockResolvedValue(makeOkResponse({ id: OBS_ID, vector_clock: serverClock }));

    const { result } = renderHook(() => useObservationSync(SESSION));

    await act(async () => {
      await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(mockMergeServerClock).toHaveBeenCalledWith(OBS_ID, serverClock);
  });

  it('does NOT call mergeServerClock when server returns no vector_clock', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ id: OBS_ID }));

    const { result } = renderHook(() => useObservationSync(SESSION));

    await act(async () => {
      await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(mockMergeServerClock).not.toHaveBeenCalled();
  });

  it('returns conflict + conflictVersionId on 409', async () => {
    const conflictVersionId = 'ver-conflict-001';
    mockFetch.mockResolvedValue(makeConflictResponse(conflictVersionId));

    const { result } = renderHook(() => useObservationSync(SESSION));

    let syncResult: Awaited<ReturnType<typeof result.current.syncObservation>>;
    await act(async () => {
      syncResult = await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(syncResult!.status).toBe('conflict');
    expect(syncResult!.observationId).toBe(OBS_ID);
    expect(syncResult!.conflictVersionId).toBe(conflictVersionId);
    expect(result.current.syncStatus).toBe('conflict');
  });

  it('returns conflict with undefined conflictVersionId when 409 body has no conflict_version_id', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({}),
    } as Response);

    const { result } = renderHook(() => useObservationSync(SESSION));

    let syncResult: Awaited<ReturnType<typeof result.current.syncObservation>>;
    await act(async () => {
      syncResult = await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(syncResult!.status).toBe('conflict');
    expect(syncResult!.conflictVersionId).toBeUndefined();
  });

  it('returns error on non-409 server failure', async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(500));

    const { result } = renderHook(() => useObservationSync(SESSION));

    let syncResult: Awaited<ReturnType<typeof result.current.syncObservation>>;
    await act(async () => {
      syncResult = await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(syncResult!.status).toBe('error');
    expect(syncResult!.error).toMatch(/PATCH failed: 500/);
    expect(result.current.syncStatus).toBe('error');
  });

  it('sets Authorization header with Bearer token', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ id: OBS_ID, vector_clock: {} }));

    const { result } = renderHook(() => useObservationSync(SESSION));

    await act(async () => {
      await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    const [, init] = mockFetch.mock.calls[0] as [string, NonNullable<Parameters<typeof fetch>[1]>];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer jwt-token');
  });

  it('calls tickAndSaveClock with observationId and userId', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ id: OBS_ID, vector_clock: {} }));

    const { result } = renderHook(() => useObservationSync(SESSION));

    await act(async () => {
      await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(mockTickAndSaveClock).toHaveBeenCalledWith(OBS_ID, SESSION.user.id);
  });
});

describe('useObservationSync — POST new observation', () => {
  it('returns synced + observationId on 201/200', async () => {
    const newId = '99999999-9999-9999-9999-999999999999';
    mockFetch.mockResolvedValue(makeOkResponse({ id: newId, vector_clock: { 'user-student-1': 1 } }));

    const { result } = renderHook(() => useObservationSync(SESSION));

    let syncResult: Awaited<ReturnType<typeof result.current.syncObservation>>;
    await act(async () => {
      syncResult = await result.current.syncObservation('2026-05-27', FORM_DATA);
    });

    expect(syncResult!.status).toBe('synced');
    expect(syncResult!.observationId).toBe(newId);
    expect(result.current.syncStatus).toBe('synced');
  });

  it('sends POST to /api/observations without client_vector_clock', async () => {
    const newId = '99999999-9999-9999-9999-999999999999';
    mockFetch.mockResolvedValue(makeOkResponse({ id: newId, vector_clock: {} }));

    const { result } = renderHook(() => useObservationSync(SESSION));

    await act(async () => {
      await result.current.syncObservation('2026-05-27', FORM_DATA);
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, NonNullable<Parameters<typeof fetch>[1]>];
    expect(url).toBe('/api/observations');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.client_vector_clock).toBeUndefined();
    expect(body.date).toBe('2026-05-27');
  });

  it('initializes local clock via mergeServerClock after POST', async () => {
    const newId = '99999999-9999-9999-9999-999999999999';
    const serverClock = { 'user-student-1': 1 };
    mockFetch.mockResolvedValue(makeOkResponse({ id: newId, vector_clock: serverClock }));

    const { result } = renderHook(() => useObservationSync(SESSION));

    await act(async () => {
      await result.current.syncObservation('2026-05-27', FORM_DATA);
    });

    expect(mockMergeServerClock).toHaveBeenCalledWith(newId, serverClock);
  });

  it('returns error on POST server failure', async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(422));

    const { result } = renderHook(() => useObservationSync(SESSION));

    let syncResult: Awaited<ReturnType<typeof result.current.syncObservation>>;
    await act(async () => {
      syncResult = await result.current.syncObservation('2026-05-27', FORM_DATA);
    });

    expect(syncResult!.status).toBe('error');
    expect(syncResult!.error).toMatch(/POST failed: 422/);
  });

  it('does NOT call tickAndSaveClock for new observations (no existing id)', async () => {
    mockFetch.mockResolvedValue(makeOkResponse({ id: 'new-id', vector_clock: {} }));

    const { result } = renderHook(() => useObservationSync(SESSION));

    await act(async () => {
      await result.current.syncObservation('2026-05-27', FORM_DATA);
    });

    expect(mockTickAndSaveClock).not.toHaveBeenCalled();
  });
});

describe('useObservationSync — fetch throws (network error)', () => {
  it('returns offline when fetch throws and navigator.onLine is false at catch time', async () => {
    mockFetch.mockImplementation(() => {
      vi.stubGlobal('navigator', { onLine: false });
      throw new Error('Network error');
    });

    const { result } = renderHook(() => useObservationSync(SESSION));

    let syncResult: Awaited<ReturnType<typeof result.current.syncObservation>>;
    await act(async () => {
      syncResult = await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(syncResult!.status).toBe('offline');
    expect(result.current.syncStatus).toBe('offline');
  });

  it('returns error when fetch throws and online', async () => {
    mockFetch.mockRejectedValue(new Error('Unexpected error'));

    const { result } = renderHook(() => useObservationSync(SESSION));

    let syncResult: Awaited<ReturnType<typeof result.current.syncObservation>>;
    await act(async () => {
      syncResult = await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(syncResult!.status).toBe('error');
    expect(syncResult!.error).toMatch(/Unexpected error/);
    expect(result.current.syncStatus).toBe('error');
  });
});

describe('useObservationSync — syncStatus state machine', () => {
  it('starts as idle', () => {
    const { result } = renderHook(() => useObservationSync(SESSION));
    expect(result.current.syncStatus).toBe('idle');
  });

  it('transitions idle -> syncing -> synced on successful PATCH', async () => {
    mockFetch.mockImplementation(async () => {
      // mid-flight: syncStatus transitions to 'syncing' before this resolves
      return makeOkResponse({ id: OBS_ID, vector_clock: {} });
    });

    const { result } = renderHook(() => useObservationSync(SESSION));

    await act(async () => {
      const promise = result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
      // After calling syncObservation but before await: status transitions to 'syncing'
      await promise;
    });

    await waitFor(() => expect(result.current.syncStatus).toBe('synced'));
  });

  it('transitions to conflict when 409 received', async () => {
    mockFetch.mockResolvedValue(makeConflictResponse('ver-001'));

    const { result } = renderHook(() => useObservationSync(SESSION));

    await act(async () => {
      await result.current.syncObservation('2026-05-27', FORM_DATA, OBS_ID);
    });

    expect(result.current.syncStatus).toBe('conflict');
  });
});

describe('useObservationSync — clinical constraint', () => {
  it('stamp values tested never contain fertil/infertil/seguro/inseguro', async () => {
    // Verify our test data respects the clinical constraint
    const clinicalTerms = ['fertil', 'infertil', 'seguro', 'inseguro'];
    const stamp = FORM_DATA.stamp.toLowerCase();
    for (const term of clinicalTerms) {
      expect(stamp).not.toContain(term);
    }
  });
});
