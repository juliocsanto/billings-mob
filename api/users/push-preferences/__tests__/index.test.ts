/**
 * Integration tests — GET/PUT /api/users/push-preferences
 *
 * Tests Hono handlers in-process using app.request().
 * Supabase clients are mocked via vi.mock to avoid needing a real DB.
 *
 * Coverage targets (TDD RED phase — all written before implementation):
 *   - GET /: 401 without auth, defaults when no row exists, row returned when exists
 *   - PUT /: 401 without auth, persists preferences, returns updated object,
 *            validates HH:MM format for daily_reminder_time
 *
 * LGPD: fcm_token never appears in console.log in handler under test.
 * Clinical constraint: no fertile/infertile language anywhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOCK_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const STUDENT_JWT  = 'mock.student.jwt';

const studentHeaders = {
  Authorization: `Bearer ${STUDENT_JWT}`,
  'Content-Type': 'application/json',
};

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockFrom = vi.fn();

vi.mock('../../../_lib/supabaseClient', () => ({
  createAuthenticatedClient: vi.fn((jwt: string) => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: MOCK_USER_ID,
            user_metadata: { role: jwt.includes('instructor') ? 'instructor' : 'student' },
          },
        },
        error: null,
      }),
    },
    from: mockFrom,
  })),
  createServiceClient: vi.fn(() => ({ from: vi.fn() })),
}));

// Import after mock registration
import app from '../index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a Supabase chain that ends in .single() resolving with { data, error }.
 * Used for the SELECT/GET path.
 */
function makeSelectChain(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

/**
 * Builds a Supabase chain for upsert operations.
 */
function makeUpsertChain(data: unknown, error: unknown = null) {
  return {
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

// ─── GET /api/users/push-preferences ─────────────────────────────────────────

describe('GET /api/users/push-preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await app.request('/');

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 200 with default preferences when user has no row in push_preferences', async () => {
    // Supabase returns PGRST116 (no rows) — handler should return defaults
    mockFrom.mockReturnValue(makeSelectChain(null, { code: 'PGRST116', message: 'no rows' }));

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as {
      data: {
        user_id: string;
        daily_reminder_enabled: boolean;
        daily_reminder_time: string;
        apex_alert_enabled: boolean;
        conflict_alert_enabled: boolean;
        whatsapp_enabled: boolean;
        fcm_token: null;
      };
    };
    expect(json.data.user_id).toBe(MOCK_USER_ID);
    expect(json.data.daily_reminder_enabled).toBe(false);
    expect(json.data.daily_reminder_time).toBe('21:00');
    expect(json.data.apex_alert_enabled).toBe(true);
    expect(json.data.conflict_alert_enabled).toBe(true);
    expect(json.data.whatsapp_enabled).toBe(false);
    // LGPD: fcm_token must not be in defaults (null)
    expect(json.data.fcm_token).toBeNull();
  });

  it('returns 200 with existing preferences from the database', async () => {
    const existingPrefs = {
      user_id: MOCK_USER_ID,
      daily_reminder_enabled: true,
      daily_reminder_time: '20:00',
      apex_alert_enabled: false,
      conflict_alert_enabled: true,
      whatsapp_enabled: false,
      fcm_token: null, // LGPD: never expose fcm_token in the response projection
    };
    mockFrom.mockReturnValue(makeSelectChain(existingPrefs));

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof existingPrefs };
    expect(json.data.daily_reminder_enabled).toBe(true);
    expect(json.data.daily_reminder_time).toBe('20:00');
    expect(json.data.apex_alert_enabled).toBe(false);
  });

  it('returns 500 when database query fails with unexpected error', async () => {
    mockFrom.mockReturnValue(makeSelectChain(null, { code: 'UNEXPECTED', message: 'DB error' }));

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(500);
  });
});

// ─── PUT /api/users/push-preferences ─────────────────────────────────────────

describe('PUT /api/users/push-preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await app.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_reminder_enabled: true }),
    });

    expect(res.status).toBe(401);
  });

  it('persists preferences and returns the updated object', async () => {
    const updatedPrefs = {
      user_id: MOCK_USER_ID,
      daily_reminder_enabled: true,
      daily_reminder_time: '20:30',
      apex_alert_enabled: true,
      conflict_alert_enabled: false,
      whatsapp_enabled: false,
      fcm_token: null,
    };
    mockFrom.mockReturnValue(makeUpsertChain(updatedPrefs));

    const res = await app.request('/', {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({
        daily_reminder_enabled: true,
        daily_reminder_time: '20:30',
        conflict_alert_enabled: false,
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof updatedPrefs };
    expect(json.data.daily_reminder_enabled).toBe(true);
    expect(json.data.daily_reminder_time).toBe('20:30');
    expect(json.data.conflict_alert_enabled).toBe(false);
  });

  it('returns 400 when daily_reminder_time is not in HH:MM format', async () => {
    const res = await app.request('/', {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ daily_reminder_time: '9:5' }), // invalid — no zero-padding
    });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: string; message: string };
    expect(json.error).toBe('BadRequest');
    expect(json.message).toContain('HH:MM');
  });

  it('returns 400 when daily_reminder_time has invalid hours (>23)', async () => {
    const res = await app.request('/', {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ daily_reminder_time: '25:00' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when daily_reminder_time has invalid minutes (>59)', async () => {
    const res = await app.request('/', {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ daily_reminder_time: '12:60' }),
    });

    expect(res.status).toBe(400);
  });

  it('accepts valid daily_reminder_time formats like "09:00" and "23:59"', async () => {
    const saved = {
      user_id: MOCK_USER_ID,
      daily_reminder_enabled: false,
      daily_reminder_time: '09:00',
      apex_alert_enabled: true,
      conflict_alert_enabled: true,
      whatsapp_enabled: false,
      fcm_token: null,
    };
    mockFrom.mockReturnValue(makeUpsertChain(saved));

    const res = await app.request('/', {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ daily_reminder_time: '09:00' }),
    });

    expect(res.status).toBe(200);
  });

  it('returns 500 when database upsert fails', async () => {
    mockFrom.mockReturnValue(makeUpsertChain(null, { code: 'DB_FAIL', message: 'write error' }));

    const res = await app.request('/', {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({ daily_reminder_enabled: true }),
    });

    expect(res.status).toBe(500);
  });

  it('accepts empty body (no-op update) without error', async () => {
    const existing = {
      user_id: MOCK_USER_ID,
      daily_reminder_enabled: false,
      daily_reminder_time: '21:00',
      apex_alert_enabled: true,
      conflict_alert_enabled: true,
      whatsapp_enabled: false,
      fcm_token: null,
    };
    mockFrom.mockReturnValue(makeUpsertChain(existing));

    const res = await app.request('/', {
      method: 'PUT',
      headers: studentHeaders,
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });
});
