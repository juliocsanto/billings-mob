/**
 * Integration tests — GET/PATCH /api/observations/:id
 *
 * Tests the [id].ts handler including:
 *   - Fetch single observation with version history
 *   - PATCH with vector clock increment
 *   - LGPD: relations/notes never in audit_log
 *   - notFound when observation does not exist or RLS blocks access
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOCK_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_CYCLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d481';
const MOCK_OBS_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d482';
const MOCK_VERSION_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d483';
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

import app from '../observations/[id]';

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
    vector_clock: { [MOCK_USER_ID]: 1 },
    version: 1,
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    ...overrides,
  };
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_VERSION_ID,
    observation_id: MOCK_OBS_ID,
    vector_clock: { [MOCK_USER_ID]: 1 },
    data: { stamp: 'seco', mucus: null, bleeding: null, cycle_id: MOCK_CYCLE_ID, version: 1 },
    author_id: MOCK_USER_ID,
    author_role: 'student',
    created_at: '2026-05-25T00:00:00Z',
    conflict_resolved: false,
    resolved_by: null,
    resolved_at: null,
    ...overrides,
  };
}

// ─── GET /api/observations/:id ────────────────────────────────────────────────

describe('GET /api/observations/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  it('returns 200 with observation and empty versions array', async () => {
    const obs = makeObservation();
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: obs, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });

    const res = await app.request(`/${MOCK_OBS_ID}`, { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { id: string; versions: unknown[] } };
    expect(json.data.id).toBe(MOCK_OBS_ID);
    expect(json.data.versions).toEqual([]);
  });

  it('returns 200 with observation and its versions', async () => {
    const obs = makeObservation();
    const version = makeVersion();
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: obs, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [version], error: null }),
      });

    const res = await app.request(`/${MOCK_OBS_ID}`, { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { versions: typeof version[] } };
    expect(json.data.versions).toHaveLength(1);
    expect(json.data.versions[0].id).toBe(MOCK_VERSION_ID);
  });

  it('returns 404 when observation does not exist', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    const res = await app.request(`/${MOCK_OBS_ID}`, { headers: studentHeaders });

    expect(res.status).toBe(404);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('NotFound');
  });

  it('returns 500 when versions query fails', async () => {
    const obs = makeObservation();
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: obs, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
      });

    const res = await app.request(`/${MOCK_OBS_ID}`, { headers: studentHeaders });

    expect(res.status).toBe(500);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.request(`/${MOCK_OBS_ID}`);

    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/observations/:id ──────────────────────────────────────────────

describe('PATCH /api/observations/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  const patchBody = { stamp: 'seco' as const };

  it('patches observation and returns 200 with updated data', async () => {
    const current = makeObservation({ vector_clock: {} });
    const updated = makeObservation({ stamp: 'seco', version: 2 });

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: current, error: null }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updated, error: null }),
      });

    const res = await app.request(`/${MOCK_OBS_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify(patchBody),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { stamp: string }; conflict_detected: boolean };
    expect(json.data.stamp).toBe('seco');
    expect(json.conflict_detected).toBe(false);
  });

  it('single sequential edit is never flagged as a conflict', async () => {
    // detectConflict(increment(clock, user), clock) is always false
    // because the new clock always dominates the old one.
    const current = makeObservation({ vector_clock: {} });
    const updated = makeObservation({ stamp: 'seco' });

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: current, error: null }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updated, error: null }),
      });

    const res = await app.request(`/${MOCK_OBS_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify(patchBody),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { conflict_detected: boolean };
    expect(json.conflict_detected).toBe(false);
  });

  it('returns 404 when observation not found', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    const res = await app.request(`/${MOCK_OBS_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify(patchBody),
    });

    expect(res.status).toBe(404);
  });

  it('returns 500 when version snapshot insert fails', async () => {
    const current = makeObservation({ vector_clock: {} });

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: current, error: null }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: new Error('Version insert failed') }),
      });

    const res = await app.request(`/${MOCK_OBS_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify(patchBody),
    });

    expect(res.status).toBe(500);
  });

  it('returns 500 when observation update fails', async () => {
    const current = makeObservation({ vector_clock: {} });

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: current, error: null }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: new Error('Update failed') }),
      });

    const res = await app.request(`/${MOCK_OBS_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify(patchBody),
    });

    expect(res.status).toBe(500);
  });

  it('returns 400 when PATCH body is empty object', async () => {
    const res = await app.request(`/${MOCK_OBS_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when PATCH body contains forbidden stamp value', async () => {
    const res = await app.request(`/${MOCK_OBS_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify({ stamp: 'fertil' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when PATCH body contains unknown key (strict mode)', async () => {
    const res = await app.request(`/${MOCK_OBS_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify({ stamp: 'seco', date: '2026-05-25' }),
    });

    expect(res.status).toBe(400);
  });

  it('LGPD: audit_log insert does NOT contain relations or notes', async () => {
    const current = makeObservation({ relations: true, notes: 'private note', vector_clock: {} });
    const updated = makeObservation({ stamp: 'seco', version: 2 });

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: current, error: null }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updated, error: null }),
      });

    await app.request(`/${MOCK_OBS_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify({ stamp: 'seco' }),
    });

    expect(mockAuditInsert).toHaveBeenCalled();
    const auditCall = mockAuditInsert.mock.calls[0][0] as Record<string, unknown>;
    const auditStr = JSON.stringify(auditCall);
    expect(auditStr).not.toContain('"relations"');
    expect(auditStr).not.toContain('"notes"');
    expect(auditStr).not.toContain('private note');
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.request(`/${MOCK_OBS_ID}`, {
      method: 'PATCH',
      body: JSON.stringify(patchBody),
    });

    expect(res.status).toBe(401);
  });
});
