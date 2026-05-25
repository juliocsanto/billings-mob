/**
 * Integration tests — GET/POST /api/observations
 *
 * Tests Hono handlers in-process using app.request().
 * Supabase clients are mocked via vi.mock to avoid needing a real DB.
 *
 * Coverage targets:
 *   - api/observations/index.ts: all branches
 *   - api/_lib/auth.ts: success + 401 paths
 *   - api/_lib/errorHandler.ts: all error helpers
 *   - LGPD: relations/notes never appear in audit_log calls
 *   - Clinical: stamp enum enforcement (Zod rejects fertil/infertil/seguro/inseguro)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constants (defined inline to avoid vi.mock hoisting issues) ─────────────
const MOCK_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_CYCLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d481';
const MOCK_OBS_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d482';
const MOCK_JWT = 'mock.jwt.token';

const studentHeaders = {
  Authorization: `Bearer ${MOCK_JWT}`,
  'Content-Type': 'application/json',
};

// ─── Mocks (must be called before app import; vi.mock is hoisted) ───────────
const mockAuditInsert = vi.fn();
const mockServiceFrom = vi.fn(() => ({ insert: mockAuditInsert }));
const mockFrom = vi.fn();

vi.mock('../_lib/supabaseClient', () => ({
  createAuthenticatedClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            user_metadata: { role: 'student' },
          },
        },
        error: null,
      }),
    },
    from: mockFrom,
  })),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

import app from '../observations/index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeObservation(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_OBS_ID,
    user_id: MOCK_USER_ID,
    cycle_id: MOCK_CYCLE_ID,
    date: '2026-05-25',
    stamp: 'muco',
    mucus: 'elastico',
    bleeding: null,
    relations: false,
    notes: '',
    vector_clock: {},
    version: 1,
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    ...overrides,
  };
}

/**
 * Creates a thennable chain mock for Supabase query builder.
 * The GET /api/observations handler builds a chain:
 *   from().select().order().range() [.eq()? .gte()? .lte()?]
 * and then does `await dbQuery` — so the chain must be awaitable at any point.
 * Using a thennable object allows: `const { data, error } = await chain`.
 */
function makeGetChain(resolvedData: unknown, resolvedError: unknown = null) {
  const result = { data: resolvedData, error: resolvedError };
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  // thennable: allows `await chain` to resolve with result
  chain.then = (
    onFulfilled: (v: typeof result) => unknown,
    onRejected?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

// ─── GET /api/observations ───────────────────────────────────────────────────

describe('GET /api/observations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  it('returns 200 with empty array when no observations exist', async () => {
    mockFrom.mockReturnValue(makeGetChain([]));

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: unknown[] };
    expect(json.data).toEqual([]);
  });

  it('returns 200 with list of observations', async () => {
    const obs = makeObservation();
    mockFrom.mockReturnValue(makeGetChain([obs]));

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof obs[] };
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(MOCK_OBS_ID);
  });

  it('filters by cycle_id when provided', async () => {
    const chain = makeGetChain([]);
    const eqSpy = vi.fn().mockReturnValue(chain);
    (chain as Record<string, unknown>).eq = eqSpy;
    mockFrom.mockReturnValue(chain);

    const res = await app.request(`/?cycle_id=${MOCK_CYCLE_ID}`, {
      headers: studentHeaders,
    });

    expect(res.status).toBe(200);
    expect(eqSpy).toHaveBeenCalledWith('cycle_id', MOCK_CYCLE_ID);
  });

  it('returns 500 when Supabase query fails', async () => {
    mockFrom.mockReturnValue(makeGetChain(null, new Error('DB error')));

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('InternalServerError');
  });

  it('returns 401 when no Authorization header provided', async () => {
    const res = await app.request('/');

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid query params (limit exceeds max)', async () => {
    const res = await app.request('/?limit=9999', { headers: studentHeaders });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/observations ──────────────────────────────────────────────────

describe('POST /api/observations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  const validBody = {
    date: '2026-05-25',
    stamp: 'muco',
    mucus: 'elastico',
    bleeding: null,
    relations: false,
    notes: 'Test note',
    cycle_id: MOCK_CYCLE_ID,
  };

  it('creates observation and returns 201', async () => {
    const created = makeObservation();
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: created, error: null }),
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(201);
    const json = await res.json() as { data: typeof created };
    expect(json.data.id).toBe(MOCK_OBS_ID);
    expect(json.data.stamp).toBe('muco');
  });

  it('returns 400 when stamp is "fertil" (clinical constraint)', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ ...validBody, stamp: 'fertil' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when stamp is "infertil"', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ ...validBody, stamp: 'infertil' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when stamp is "seguro"', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ ...validBody, stamp: 'seguro' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when stamp is "inseguro"', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ ...validBody, stamp: 'inseguro' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when date format is invalid (DD/MM/YYYY)', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ ...validBody, date: '25/05/2026' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when date month is out of range (13)', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ ...validBody, date: '2026-13-01' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when relations field is missing', async () => {
    const { relations: _, ...bodyWithoutRelations } = validBody;
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(bodyWithoutRelations),
    });

    expect(res.status).toBe(400);
  });

  it('LGPD: audit_log insert does NOT contain relations or notes', async () => {
    const created = makeObservation();
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: created, error: null }),
    });

    await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(validBody),
    });

    expect(mockAuditInsert).toHaveBeenCalled();
    const auditCall = mockAuditInsert.mock.calls[0][0] as Record<string, unknown>;
    const auditStr = JSON.stringify(auditCall);
    expect(auditStr).not.toContain('"relations"');
    expect(auditStr).not.toContain('"notes"');
  });

  it('returns 500 when Supabase insert fails', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error('Insert failed') }),
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(500);
  });

  it('returns 400 on check constraint violation (code 23514)', async () => {
    const constraintError = { code: '23514', message: 'check constraint violation' };
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: constraintError }),
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(400);
  });

  it('returns 409 on unique violation (code 23505)', async () => {
    const uniqueError = { code: '23505', message: 'unique constraint violation' };
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: uniqueError }),
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(409);
  });

  it('returns 401 when no token provided', async () => {
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(401);
  });

  it('creates observation without optional cycle_id', async () => {
    const created = makeObservation({ cycle_id: null });
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: created, error: null }),
    });

    const { cycle_id: _, ...bodyWithoutCycleId } = validBody;
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(bodyWithoutCycleId),
    });

    expect(res.status).toBe(201);
  });

  it('returns 500 when insert returns null data without error', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(500);
  });
});
