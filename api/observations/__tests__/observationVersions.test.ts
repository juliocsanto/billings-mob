/**
 * TDD — Integration tests: GET /api/observations/:id/versions
 * Sprint 2 item #11 — Version history endpoint
 *
 * Pattern: consistent with api/__tests__/observations-id.test.ts —
 *   vi.mock modules before import, use app.request() for Hono handler calls.
 *
 * ADR-003: RLS scopes access — student sees own, instructor sees linked student's.
 * ADR-004: observation_versions rows created on every PATCH; this endpoint reads them.
 * LGPD: observation_versions.data contains ONLY stamp, mucus, bleeding — never relations/notes.
 *
 * Clinical constraint: endpoint never classifies days as fertile/infertile.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Constants ──────────────────────────────────────────────────────────────────
const MOCK_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MOCK_OBS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MOCK_JWT = 'mock.jwt.token';

const studentHeaders = {
  Authorization: `Bearer ${MOCK_JWT}`,
  'Content-Type': 'application/json',
};

// ── Mocks ──────────────────────────────────────────────────────────────────────
const mockFrom = vi.fn();

// SEC-003: user_profiles chain needed because requireAuth now reads role from user_profiles
const mockProfileChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null }),
};

vi.mock('../../_lib/supabaseClient', () => ({
  createAuthenticatedClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: MOCK_USER_ID,
            user_metadata: { role: 'student' },
          },
        },
        error: null,
      }),
    },
    from: mockFrom,
  })),
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
  })),
}));

vi.mock('../../_lib/rateLimit', () => ({
  apiRateLimit: vi.fn(async (_c: unknown, next: () => Promise<void>) => { await next(); }),
}));

// ── Import handler after mocks ─────────────────────────────────────────────────
import app from '../[id]/versions';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeVersionsChain(returnValue: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(returnValue),
  };
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ver-1',
    observation_id: MOCK_OBS_ID,
    vector_clock: { [MOCK_USER_ID]: 1 },
    // LGPD: data contains ONLY stamp, mucus, bleeding — never relations or notes
    data: { stamp: 'seco', mucus: null, bleeding: null },
    author_id: MOCK_USER_ID,
    conflict_resolved: false,
    created_at: '2026-05-27T10:00:00Z',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/observations/:id/versions', () => {
  // Helper: set up mockFrom to be table-aware (SEC-003: first call is user_profiles)
  function setupMock(versionsReturn: { data: unknown; error: unknown }) {
    const versionsChain = makeVersionsChain(versionsReturn);
    mockProfileChain.select.mockReturnThis();
    mockProfileChain.eq.mockReturnThis();
    mockProfileChain.single.mockResolvedValue({ data: { role: 'student' }, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return mockProfileChain;
      return versionsChain;
    });
    return versionsChain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with empty array when observation has no versions', async () => {
    setupMock({ data: [], error: null });

    const res = await app.request(`/${MOCK_OBS_ID}/versions`, { headers: studentHeaders });
    const body = await res.json() as { data: unknown[]; count: number };

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('returns 200 with version list in response', async () => {
    const v1 = makeVersion({ id: 'ver-1', created_at: '2026-05-27T10:00:00Z' });
    const v2 = makeVersion({ id: 'ver-2', created_at: '2026-05-27T14:00:00Z', vector_clock: { [MOCK_USER_ID]: 2 } });
    setupMock({ data: [v2, v1], error: null });

    const res = await app.request(`/${MOCK_OBS_ID}/versions`, { headers: studentHeaders });
    const body = await res.json() as { data: typeof v1[]; count: number };

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.count).toBe(2);
    // Most recent version should be first (DESC order)
    expect(body.data[0].id).toBe('ver-2');
    expect(body.data[1].id).toBe('ver-1');
  });

  it('returns 401 when no Authorization header', async () => {
    const res = await app.request(`/${MOCK_OBS_ID}/versions`);
    expect(res.status).toBe(401);
  });

  it('returns 500 when database query fails', async () => {
    setupMock({ data: null, error: new Error('DB connection error') });

    const res = await app.request(`/${MOCK_OBS_ID}/versions`, { headers: studentHeaders });
    expect(res.status).toBe(500);
  });

  it('returns version data with stamp, mucus, bleeding — never relations or notes', async () => {
    const version = makeVersion();
    setupMock({ data: [version], error: null });

    const res = await app.request(`/${MOCK_OBS_ID}/versions`, { headers: studentHeaders });
    const body = await res.json() as { data: Array<{ data: Record<string, unknown> }> };

    expect(res.status).toBe(200);
    const versionData = body.data[0].data;
    // LGPD: relations and notes must NOT appear in version data
    expect(versionData).not.toHaveProperty('relations');
    expect(versionData).not.toHaveProperty('notes');
    // Clinical constraint: no fertile/infertile classification in response body
    const responseText = JSON.stringify(body).toLowerCase();
    expect(responseText).not.toContain('fértil');
    expect(responseText).not.toContain('fertil');
    expect(responseText).not.toContain('infértil');
    expect(responseText).not.toContain('seguro');
    expect(responseText).not.toContain('inseguro');
  });

  it('queries observation_versions table with correct observation_id filter', async () => {
    const chain = setupMock({ data: [], error: null });

    await app.request(`/${MOCK_OBS_ID}/versions`, { headers: studentHeaders });

    // SEC-003: mockFrom is called twice — first for user_profiles (auth), then observation_versions
    expect(mockFrom).toHaveBeenCalledWith('observation_versions');
    expect(chain.eq).toHaveBeenCalledWith('observation_id', MOCK_OBS_ID);
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('uses explicit column selection — not SELECT *', async () => {
    const chain = setupMock({ data: [], error: null });

    await app.request(`/${MOCK_OBS_ID}/versions`, { headers: studentHeaders });

    expect(chain.select).toHaveBeenCalled();
    // chain.select is for observation_versions only (user_profiles uses mockProfileChain.select)
    const selectArg = chain.select.mock.calls[0][0] as string;
    expect(selectArg.trim()).not.toBe('*');
    // Must include required fields per API contract
    expect(selectArg).toContain('id');
    expect(selectArg).toContain('vector_clock');
    expect(selectArg).toContain('data');
    expect(selectArg).toContain('author_id');
    expect(selectArg).toContain('conflict_resolved');
    expect(selectArg).toContain('created_at');
  });
});
