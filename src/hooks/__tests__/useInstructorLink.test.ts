// @vitest-environment jsdom
/**
 * Unit tests — useInstructorLink hook
 *
 * Covers:
 *  - searchInstructor: success path (instructor found)
 *  - searchInstructor: error path (instructor not found / Supabase error)
 *  - searchInstructor: null data without error
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
 * LGPD: only instructor id and full_name are used — no student data.
 * Clinical constraint: no fertile/infertile language.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import type { Session } from '@supabase/supabase-js';

// ── Supabase mock ──────────────────────────────────────────────────────────────
// Must use vi.fn() directly inside factory to avoid hoisting issue
vi.mock('../../lib/supabaseClient', () => {
  const single = vi.fn();
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single,
  };
  const from = vi.fn().mockReturnValue(builder);
  return {
    supabase: { from },
    __mocks: { from, builder, single },
  };
});

// ── Fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocks
import { useInstructorLink } from '../useInstructorLink';
import { supabase } from '../../lib/supabaseClient';

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
function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useInstructorLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: GET /api/instructor-student-links returns empty list
    mockFetch.mockResolvedValue(makeOkResponse({ data: [] }));
    // Default: Supabase single returns no data (not found)
    const fromMock = supabase.from as ReturnType<typeof vi.fn>;
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    });
  });

  // ── searchInstructor: success ──────────────────────────────────────────────

  describe('searchInstructor', () => {
    it('sets instructor state when Supabase returns a match', async () => {
      const fromMock = supabase.from as ReturnType<typeof vi.fn>;
      fromMock.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'instr-001', full_name: 'Maria Instrutora' },
          error: null,
        }),
      });

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      act(() => {
        result.current.searchInstructor('maria@school.com');
      });

      // loading should be true immediately
      expect(result.current.loading).toBe(true);

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.instructor).toEqual({
        id: 'instr-001',
        full_name: 'Maria Instrutora',
      });
      expect(result.current.error).toBeNull();
    });

    it('sets error state when Supabase returns an error (instructor not found)', async () => {
      const fromMock = supabase.from as ReturnType<typeof vi.fn>;
      fromMock.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'No rows returned' },
        }),
      });

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      act(() => {
        result.current.searchInstructor('naoexiste@school.com');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.instructor).toBeNull();
      expect(result.current.error).toMatch(/instrutora não encontrada/i);
    });

    it('sets error state when Supabase returns null data without error', async () => {
      const fromMock = supabase.from as ReturnType<typeof vi.fn>;
      fromMock.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

      act(() => {
        result.current.searchInstructor('unknown@school.com');
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
    const fromMock = supabase.from as ReturnType<typeof vi.fn>;
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'instr-001', full_name: 'Ana' },
        error: null,
      }),
    });

    const { result } = renderHook(() => useInstructorLink(SESSION_WITH_TOKEN));

    act(() => {
      result.current.searchInstructor('ana@school.com');
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const allState = JSON.stringify(result.current);
    expect(allState).not.toMatch(/fértil|fertil|infértil|infertil/i);
  });
});
