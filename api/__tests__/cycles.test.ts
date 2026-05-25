/**
 * Integration tests — GET/POST/PATCH /api/cycles
 *
 * Tests the cycles/index.ts handler including:
 *   - List cycles (GET /)
 *   - Create cycle (POST /)
 *   - Get cycle with observations (GET /:id)
 *   - Update cycle (PATCH /:id)
 *   - Error branches: 404, 500, 400, 401
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOCK_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_CYCLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d481';
const MOCK_OBS_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d482';
const MOCK_JWT = 'mock.jwt.token';

const studentHeaders = {
  Authorization: `Bearer ${MOCK_JWT}`,
  'Content-Type': 'application/json',
};

// ─── Mocks ───────────────────────────────────────────────────────────────────
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

import app from '../cycles/index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCycle(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_CYCLE_ID,
    user_id: MOCK_USER_ID,
    start_date: '2026-05-01',
    end_date: null,
    apex_date: null,
    status: 'active',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

// ─── GET /api/cycles ──────────────────────────────────────────────────────────

describe('GET /api/cycles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  it('returns 200 with empty array when no cycles', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: unknown[] };
    expect(json.data).toEqual([]);
  });

  it('returns 200 with list of cycles', async () => {
    const cycle = makeCycle();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [cycle], error: null }),
    });

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof cycle[] };
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(MOCK_CYCLE_ID);
  });

  it('returns 500 when DB query fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    });

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('InternalServerError');
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.request('/');

    expect(res.status).toBe(401);
  });
});

// ─── POST /api/cycles ─────────────────────────────────────────────────────────

describe('POST /api/cycles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  const validBody = { start_date: '2026-05-01' };

  it('creates cycle and returns 201', async () => {
    const cycle = makeCycle();
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: cycle, error: null }),
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(201);
    const json = await res.json() as { data: typeof cycle };
    expect(json.data.id).toBe(MOCK_CYCLE_ID);
    expect(json.data.status).toBe('active');
  });

  it('creates cycle with optional end_date and apex_date', async () => {
    const cycle = makeCycle({ end_date: '2026-05-28', apex_date: '2026-05-15' });
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: cycle, error: null }),
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        start_date: '2026-05-01',
        end_date: '2026-05-28',
        apex_date: '2026-05-15',
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json() as { data: typeof cycle };
    expect(json.data.end_date).toBe('2026-05-28');
    expect(json.data.apex_date).toBe('2026-05-15');
  });

  it('returns 400 on check constraint violation (code 23514)', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23514', message: 'check constraint' },
      }),
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('BadRequest');
  });

  it('returns 500 when Supabase insert fails with non-constraint error', async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42000', message: 'generic error' },
      }),
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(500);
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

  it('returns 400 when start_date is missing', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when start_date format is invalid', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ start_date: '01/05/2026' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(401);
  });
});

// ─── GET /api/cycles/:id ──────────────────────────────────────────────────────

describe('GET /api/cycles/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  it('returns 200 with cycle and its observations', async () => {
    const obs = {
      id: MOCK_OBS_ID,
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
    };
    const cycle = { ...makeCycle(), observations: [obs] };

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: cycle, error: null }),
    });

    const res = await app.request(`/${MOCK_CYCLE_ID}`, { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof cycle };
    expect(json.data.id).toBe(MOCK_CYCLE_ID);
    expect(json.data.observations).toHaveLength(1);
  });

  it('returns 404 when cycle not found', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    const res = await app.request(`/${MOCK_CYCLE_ID}`, { headers: studentHeaders });

    expect(res.status).toBe(404);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('NotFound');
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.request(`/${MOCK_CYCLE_ID}`);

    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/cycles/:id ────────────────────────────────────────────────────

describe('PATCH /api/cycles/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  const patchBody = { status: 'archived' as const };

  it('patches cycle and returns 200', async () => {
    const current = makeCycle();
    const updated = makeCycle({ status: 'archived', end_date: '2026-05-28' });

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: current, error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updated, error: null }),
      });

    const res = await app.request(`/${MOCK_CYCLE_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify(patchBody),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof updated };
    expect(json.data.status).toBe('archived');
  });

  it('returns 404 when cycle not found', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    const res = await app.request(`/${MOCK_CYCLE_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify(patchBody),
    });

    expect(res.status).toBe(404);
  });

  it('returns 500 when update fails', async () => {
    const current = makeCycle();

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: current, error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: new Error('Update failed') }),
      });

    const res = await app.request(`/${MOCK_CYCLE_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify(patchBody),
    });

    expect(res.status).toBe(500);
  });

  it('returns 400 when PATCH body is empty', async () => {
    const res = await app.request(`/${MOCK_CYCLE_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.request(`/${MOCK_CYCLE_ID}`, {
      method: 'PATCH',
      body: JSON.stringify(patchBody),
    });

    expect(res.status).toBe(401);
  });
});
