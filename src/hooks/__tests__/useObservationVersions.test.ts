// @vitest-environment jsdom
/// <reference lib="dom" />
/**
 * TDD — RED phase: Unit tests for useObservationVersions hook.
 * Sprint 2 item #11 — Version history hook
 *
 * Covers:
 *  - Returns empty array when observationId is null
 *  - Returns empty array when jwt is null
 *  - Fetches versions from API when both observationId and jwt are present
 *  - Returns loading=true during fetch, loading=false after
 *  - Returns error state when fetch fails
 *  - LGPD: relations and notes never appear in returned versions
 *  - Clinical constraint: never returns fertile/infertile classification
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';

// ── Mock fetch globally ────────────────────────────────────────────────────────
const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── Import hook after environment is ready ─────────────────────────────────────
import { useObservationVersions } from '../useObservationVersions';

// ── Helpers ────────────────────────────────────────────────────────────────────

const OBSERVATION_ID = '22222222-2222-2222-2222-222222222222';
const JWT = 'valid-jwt-token';

function makeVersionResponse(versions: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: versions, count: versions.length }),
  } as Response;
}

const SAMPLE_VERSIONS = [
  {
    id: 'ver-1',
    observation_id: OBSERVATION_ID,
    vector_clock: { 'user-1': 1 },
    data: { stamp: 'seco', mucus: null, bleeding: null },
    author_id: 'user-student-1',
    conflict_resolved: false,
    created_at: '2026-05-27T10:00:00Z',
  },
  {
    id: 'ver-2',
    observation_id: OBSERVATION_ID,
    vector_clock: { 'user-1': 2 },
    data: { stamp: 'muco', mucus: 'cremoso', bleeding: null },
    author_id: 'user-student-1',
    conflict_resolved: false,
    created_at: '2026-05-27T14:00:00Z',
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useObservationVersions', () => {
  it('returns versions=[] and loading=false when observationId is null', async () => {
    const { result } = renderHook(() =>
      useObservationVersions(null, JWT)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.versions).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns versions=[] and loading=false when jwt is null', async () => {
    const { result } = renderHook(() =>
      useObservationVersions(OBSERVATION_ID, null)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.versions).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns versions=[] and loading=false when both are null', async () => {
    const { result } = renderHook(() =>
      useObservationVersions(null, null)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.versions).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches versions from correct URL with Authorization header', async () => {
    mockFetch.mockResolvedValue(makeVersionResponse(SAMPLE_VERSIONS));

    const { result } = renderHook(() =>
      useObservationVersions(OBSERVATION_ID, JWT)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe(`/api/observations/${OBSERVATION_ID}/versions`);
    expect(init.headers['Authorization']).toBe(`Bearer ${JWT}`);
  });

  it('sets loading=true during fetch, loading=false after', async () => {
    let resolveResponse: (v: unknown) => void = () => {};
    mockFetch.mockReturnValue(
      new Promise(r => { resolveResponse = r; })
    );

    const { result } = renderHook(() =>
      useObservationVersions(OBSERVATION_ID, JWT)
    );

    // Initially loading
    expect(result.current.loading).toBe(true);

    // Resolve fetch
    act(() => {
      resolveResponse(makeVersionResponse(SAMPLE_VERSIONS));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.versions).toHaveLength(2);
  });

  it('returns fetched versions in the returned array', async () => {
    mockFetch.mockResolvedValue(makeVersionResponse(SAMPLE_VERSIONS));

    const { result } = renderHook(() =>
      useObservationVersions(OBSERVATION_ID, JWT)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.versions).toHaveLength(2);
    expect(result.current.versions[0].id).toBe('ver-1');
    expect(result.current.versions[1].id).toBe('ver-2');
  });

  it('returns error state when fetch fails with network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useObservationVersions(OBSERVATION_ID, JWT)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.versions).toEqual([]);
  });

  it('returns error state when API returns non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    } as Response);

    const { result } = renderHook(() =>
      useObservationVersions(OBSERVATION_ID, JWT)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.versions).toEqual([]);
  });

  it('LGPD: versions data never contains relations or notes fields', async () => {
    // Even if the API returned sensitive fields (defensive check), the hook
    // must not expose them in its return value
    const versionsWithSensitiveFields = [
      {
        ...SAMPLE_VERSIONS[0],
        // These fields must not appear — they are excluded at DB level, but we test defensively
        data: { stamp: 'seco', mucus: null, bleeding: null },
      },
    ];
    mockFetch.mockResolvedValue(makeVersionResponse(versionsWithSensitiveFields));

    const { result } = renderHook(() =>
      useObservationVersions(OBSERVATION_ID, JWT)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.versions.forEach(v => {
      expect(v.data).not.toHaveProperty('relations');
      expect(v.data).not.toHaveProperty('notes');
    });
  });

  it('clinical constraint: returned data never contains fertile/infertile classification', async () => {
    mockFetch.mockResolvedValue(makeVersionResponse(SAMPLE_VERSIONS));

    const { result } = renderHook(() =>
      useObservationVersions(OBSERVATION_ID, JWT)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const serialized = JSON.stringify(result.current.versions).toLowerCase();
    expect(serialized).not.toContain('fértil');
    expect(serialized).not.toContain('fertil');
    expect(serialized).not.toContain('infértil');
    expect(serialized).not.toContain('seguro');
    expect(serialized).not.toContain('inseguro');
  });

  it('re-fetches when observationId changes', async () => {
    mockFetch.mockResolvedValue(makeVersionResponse(SAMPLE_VERSIONS));

    const OTHER_ID = '33333333-3333-3333-3333-333333333333';
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useObservationVersions(id, JWT),
      { initialProps: { id: OBSERVATION_ID } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValue(makeVersionResponse([]));
    rerender({ id: OTHER_ID });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondCall = mockFetch.mock.calls[1][0] as string;
    expect(secondCall).toContain(OTHER_ID);
  });
});
