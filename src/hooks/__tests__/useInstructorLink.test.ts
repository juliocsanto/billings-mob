// @vitest-environment jsdom
/**
 * Unit tests — useInstructorLink hook
 *
 * S8-04 (CA-003): searchInstructor agora usa fetch para GET /api/users/search
 * em vez de supabase.from('user_profiles') diretamente.
 *
 * Covers:
 *  - searchInstructor: success path (instructor found via API)
 *  - searchInstructor: 404 path (instructor not found)
 *  - searchInstructor: non-ok API error
 *  - searchInstructor: network error (fetch throws)
 *  - searchInstructor: no session path (returns early)
 *  - searchInstructor: missing data in response body
 *  - requestLink: no session path
 *  - requestLink: 409 with "pending" message
 *  - requestLink: 409 with active/other message
 *  - requestLink: 409 when json() rejects (fallback to {})
 *  - requestLink: non-ok response (not 409)
 *  - requestLink: network error (fetch throws)
 *  - requestLink: success path (calls getMyLinks afterwards)
 *  - getMyLinks: no session (returns early)
 *  - getMyLinks: non-ok response
 *  - getMyLinks: network error (fetch throws)
 *  - getMyLinks: success path
 *  - getMyLinks: missing instructor_name defaults to ''
 *  - getMyLinks: missing data property defaults to []
 *
 * LGPD: response contains display_name, never email or phone.
 * Clinical constraint: no fertile/infertile language.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import type { Session } from '@supabase/supabase-js';

// ── Fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mock
import { useInstructorLink } from '../useInstructorLink';

// ── Session fixtures ───────────────────────────────────────────────────────────
const SESSION_WITH_TOKEN: Session = {
  access_token: 'mock-token-abc',
  token_type: 'bearer',
  user: { id: 'student-001' } as Session['user'],
  expires_in: 3600,
  expires_at: 9999999999,
  refresh_token: 'refresh-token',
};

// ── Response helpers ───────────────────────────────────────────────────────────
function makeOkResponse(body: unknown, status = 200): Response {
  return {
    ok: true,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'Server error' }),
  } as unknown as Response;
}

function makeNotFoundResponse(): Response {
  return {
    ok: false,
    status: 404,
    json: () => Promise.resolve({ error: 'NotFound', message: 'Instructor not found' }),
  } as unknown as Response;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useInstructorLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all fetches return empty links list
    mockFetch.mockResolvedValue(makeOkResponse({ data: [] }));
  });

  // ── searchInstructor ───────────────────────────────────────────────────────

  describe('searchInstructor', () => {
    it('sets instructor state when API returns a match (CA-003: uses fetch, not supabase)', async () => {
      // GET /api/users/search → 200 with instructor data
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ data: { id: 'instr-001', display_name: 'Maria Instrutora', role: 'instructor' } }),
      );

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      act(() => {
        result.current.searchInstructor('maria@school.com');
      });

      // loading should be true immediately
      expect(result.current.loading).toBe(true);

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.instructor).toEqual({
        id: 'instr-001',
        display_name: 'Maria Instrutora',
      });
      expect(result.current.error).toBeNull();
    });

    it('sends Authorization header with the JWT (CA-003: uses session.access_token)', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ data: { id: 'instr-001', display_name: 'Maria', role: 'instructor' } }),
      );

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      act(() => {
        result.current.searchInstructor('maria@school.com');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit];
      const [url, init] = fetchCall;
      expect(url).toContain('/api/users/search');
      expect(url).toContain('role=instructor');
      expect(url).toContain('email=');
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer mock-token-abc');
    });

    it('sets error state on 404 (instructor not found)', async () => {
      mockFetch.mockResolvedValueOnce(makeNotFoundResponse());

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      act(() => {
        result.current.searchInstructor('naoexiste@school.com');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.instructor).toBeNull();
      expect(result.current.error).toMatch(/instrutora não encontrada/i);
    });

    it('sets error state on non-ok API response (e.g. 500)', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      act(() => {
        result.current.searchInstructor('ana@school.com');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.instructor).toBeNull();
      expect(result.current.error).toMatch(/não foi possível buscar/i);
    });

    it('sets error state when fetch throws (network error)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      act(() => {
        result.current.searchInstructor('ana@school.com');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.instructor).toBeNull();
      expect(result.current.error).toMatch(/erro de conexão/i);
    });

    it('sets error and returns early when session is null (no-session path)', async () => {
      const { result } = renderHook(() => useInstructorLink(null));

      mockFetch.mockClear();

      act(() => {
        result.current.searchInstructor('ana@school.com');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.error).toMatch(/autenticada/i);
    });

    it('sets error when API returns 200 but body.data is missing', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({}));

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      act(() => {
        result.current.searchInstructor('ana@school.com');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.instructor).toBeNull();
      expect(result.current.error).toMatch(/instrutora não encontrada/i);
    });
  });

  // ── requestLink ────────────────────────────────────────────────────────────

  describe('requestLink', () => {
    it('sets error and returns early when session is null (no-session path)', async () => {
      const { result } = renderHook(() => useInstructorLink(null));

      mockFetch.mockClear();

      await act(async () => {
        await result.current.requestLink('instr-001');
      });

      expect(result.current.error).toMatch(/autenticada/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sets error "aguardando aprovação" on 409 with "pending" in body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Link already pending' }),
      } as unknown as Response);

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      await act(async () => {
        await result.current.requestLink('instr-001');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toMatch(/aguardando aprovação/i);
    });

    it('sets error "já existe um vínculo" on 409 with active/non-pending body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Link already active' }),
      } as unknown as Response);

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      await act(async () => {
        await result.current.requestLink('instr-001');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toMatch(/já existe um vínculo/i);
    });

    it('sets error when 409 body json() rejects (falls back to {} → não-pending message)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.reject(new Error('bad json')),
      } as unknown as Response);

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      await act(async () => {
        await result.current.requestLink('instr-001');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      // Body is {}, msg is '', not 'pending' → "já existe um vínculo"
      expect(result.current.error).toMatch(/já existe um vínculo/i);
    });

    it('sets generic error when response is non-ok and not 409', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      await act(async () => {
        await result.current.requestLink('instr-001');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toMatch(/não foi possível enviar/i);
    });

    it('catches network errors (fetch throws) and sets connection error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      await act(async () => {
        await result.current.requestLink('instr-001');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toMatch(/erro de conexão/i);
    });

    it('calls getMyLinks after successful requestLink', async () => {
      // First call: POST succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as unknown as Response);
      // Second call: GET for getMyLinks returns a list
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({
          data: [
            {
              id: 'link-001',
              instructor_id: 'instr-001',
              status: 'pending',
              instructor_name: 'Maria',
            },
          ],
        }),
      );

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      await act(async () => {
        await result.current.requestLink('instr-001');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.links).toHaveLength(1);
      expect(result.current.links[0].instructor_id).toBe('instr-001');
    });
  });

  // ── getMyLinks ─────────────────────────────────────────────────────────────

  describe('getMyLinks', () => {
    it('returns early without calling fetch when session is null', async () => {
      const { result } = renderHook(() => useInstructorLink(null));

      mockFetch.mockClear();

      await act(async () => {
        await result.current.getMyLinks();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sets error when GET returns non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      await act(async () => {
        await result.current.getMyLinks();
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toMatch(/não foi possível carregar os vínculos/i);
    });

    it('catches network errors (fetch throws) and sets error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      await act(async () => {
        await result.current.getMyLinks();
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toMatch(/erro ao carregar vínculos/i);
    });

    it('populates links array on success, using empty string for missing instructor_name', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({
          data: [
            {
              id: 'link-001',
              instructor_id: 'instr-001',
              status: 'active',
              // instructor_name is absent → should default to ''
            },
          ],
        }),
      );

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      await act(async () => {
        await result.current.getMyLinks();
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.links).toHaveLength(1);
      expect(result.current.links[0].instructor_name).toBe('');
    });

    it('uses body.data ?? [] when data property is absent', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({}));

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      await act(async () => {
        await result.current.getMyLinks();
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.links).toHaveLength(0);
    });
  });

  // ── Clinical constraint ────────────────────────────────────────────────────

  it('never includes fertile/infertile language in any state', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ data: { id: 'instr-001', display_name: 'Ana', role: 'instructor' } }),
    );

    const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

    act(() => {
      result.current.searchInstructor('ana@school.com');
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const allState = JSON.stringify(result.current);
    expect(allState).not.toMatch(/fértil|fertil|infértil|infertil/i);
  });
});
