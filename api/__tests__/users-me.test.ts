/**
 * Integration tests — GET /api/users/me
 *
 * Tests Hono handlers in-process using app.request().
 * Supabase clients are mocked via vi.mock to avoid needing a real DB.
 *
 * Coverage targets:
 *   - api/users/me.ts: all branches
 *   - GET /: student profile, instructor profile (with cenplafam_id),
 *            profile not found (404), DB failure (500), no auth (401)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOCK_STUDENT_ID    = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_INSTRUCTOR_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
const STUDENT_JWT        = 'mock.student.jwt';
const INSTRUCTOR_JWT     = 'mock.instructor.jwt';

const studentHeaders = {
  Authorization: `Bearer ${STUDENT_JWT}`,
  'Content-Type': 'application/json',
};

const instructorHeaders = {
  Authorization: `Bearer ${INSTRUCTOR_JWT}`,
  'Content-Type': 'application/json',
};

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockFrom = vi.fn();

// SEC-003 FIX: requireAuth now reads role from user_profiles (same table as the handler).
// mockFrom handles all user_profiles queries: requireAuth's role lookup returns profile.role,
// handler's full profile fetch returns the complete row. Since mockFrom.mockReturnValue sets
// a single chain reused by both callers and profiles include role, this works without
// per-caller differentiation.
vi.mock('../_lib/supabaseClient', () => ({
  createAuthenticatedClient: vi.fn((jwt: string) => {
    const isInstructor = jwt.includes('instructor');
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: isInstructor ? MOCK_INSTRUCTOR_ID : MOCK_STUDENT_ID,
              user_metadata: {},
            },
          },
          error: null,
        }),
      },
      from: mockFrom,
    };
  }),
  createServiceClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

import app from '../users/index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStudentProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_STUDENT_ID,
    role: 'student',
    full_name: 'Maria Silva',
    phone: '+5511999990001',
    cenplafam_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-05-26T00:00:00Z',
    ...overrides,
  };
}

function makeInstructorProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_INSTRUCTOR_ID,
    role: 'instructor',
    full_name: 'Ana Instrutora',
    phone: '+5511999990002',
    cenplafam_id: 'CENP-2026-001',
    created_at: '2025-06-01T00:00:00Z',
    updated_at: '2026-05-26T00:00:00Z',
    ...overrides,
  };
}

/**
 * Builds a fetch-profile mock chain: select/eq/single.
 */
function makeProfileChain(profile: unknown, fetchError: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: profile, error: fetchError }),
  };
}

// ─── GET /api/users/me ───────────────────────────────────────────────────────

describe('GET /api/users/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with authenticated student profile', async () => {
    const profile = makeStudentProfile();
    mockFrom.mockReturnValue(makeProfileChain(profile));

    const res = await app.request('/api/users/me', { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof profile };
    expect(json.data.id).toBe(MOCK_STUDENT_ID);
    expect(json.data.role).toBe('student');
    expect(json.data.full_name).toBe('Maria Silva');
    expect(json.data.cenplafam_id).toBeNull();
  });

  it('returns 200 with instructor profile including cenplafam_id', async () => {
    const profile = makeInstructorProfile();
    mockFrom.mockReturnValue(makeProfileChain(profile));

    const res = await app.request('/api/users/me', { headers: instructorHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof profile };
    expect(json.data.id).toBe(MOCK_INSTRUCTOR_ID);
    expect(json.data.role).toBe('instructor');
    expect(json.data.cenplafam_id).toBe('CENP-2026-001');
  });

  it('returns 500 when profile fetch fails (PGRST116 treated as infra error)', async () => {
    mockFrom.mockReturnValue(makeProfileChain(null, { code: 'PGRST116' }));

    const res = await app.request('/api/users/me', { headers: studentHeaders });

    expect(res.status).toBe(500);
  });

  it('returns 404 when DB returns null profile without error', async () => {
    mockFrom.mockReturnValue(makeProfileChain(null, null));

    const res = await app.request('/api/users/me', { headers: studentHeaders });

    expect(res.status).toBe(404);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('NotFound');
  });

  it('returns 500 when DB query fails with unexpected error', async () => {
    mockFrom.mockReturnValue(makeProfileChain(null, new Error('Connection timeout')));

    const res = await app.request('/api/users/me', { headers: studentHeaders });

    // After the error/resource guard split: error !== null → internalError → 500
    expect(res.status).toBe(500);
  });

  it('returns 401 when no Authorization header provided', async () => {
    const res = await app.request('/api/users/me');

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Unauthorized');
  });
});
