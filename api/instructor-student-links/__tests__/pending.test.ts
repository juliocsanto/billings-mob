/**
 * Integration tests — GET /api/instructor-student-links/pending
 *
 * TDD RED phase: these tests are written BEFORE the implementation exists.
 * They describe the exact behavior expected from the AC:
 *   - Returns 401 without token
 *   - Returns 403 if role is not 'instructor'
 *   - Returns empty list when no pending links exist
 *   - Returns only pending links for the authenticated instructor (not other instructors)
 *
 * Clinical constraint: this endpoint never exposes clinical data — only name, email, link metadata.
 * LGPD: returns only students linked to the authenticated instructor (RLS enforced).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOCK_INSTRUCTOR_ID  = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';

const MOCK_STUDENT_ID     = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_STUDENT_ID2    = 'f47ac10b-58cc-4372-a567-0e02b2c3d491';
const MOCK_LINK_ID        = 'f47ac10b-58cc-4372-a567-0e02b2c3d485';
const MOCK_LINK_ID2       = 'f47ac10b-58cc-4372-a567-0e02b2c3d486';
const INSTRUCTOR_JWT      = 'mock.instructor.jwt';
const STUDENT_JWT         = 'mock.student.jwt';

const instructorHeaders = {
  Authorization: `Bearer ${INSTRUCTOR_JWT}`,
  'Content-Type': 'application/json',
};

const studentHeaders = {
  Authorization: `Bearer ${STUDENT_JWT}`,
  'Content-Type': 'application/json',
};

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockFrom = vi.fn();

vi.mock('../../_lib/supabaseClient', () => ({
  // SEC-003 FIX: requireAuth now reads role from user_profiles instead of user_metadata.
  // The authenticated client's from() must handle both:
  //   - 'user_profiles': return the authoritative role (instructor or student)
  //   - other tables (instructor_student_links): delegate to mockFrom for per-test setup
  createAuthenticatedClient: vi.fn((jwt: string) => {
    const isInstructor = jwt.includes('instructor');
    const userId = isInstructor ? MOCK_INSTRUCTOR_ID : MOCK_STUDENT_ID;
    const resolvedRole = isInstructor ? 'instructor' : 'student';
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: userId,
              user_metadata: {},
            },
          },
          error: null,
        }),
      },
      // SEC-003: route 'user_profiles' to the authoritative role lookup;
      // route everything else to mockFrom (instructor_student_links queries).
      from: (table: string) => {
        if (table === 'user_profiles') {
          return {
            select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { role: resolvedRole }, error: null }) }) }),
          };
        }
        return mockFrom(table);
      },
    };
  }),
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
  })),
}));

// Import AFTER mocks are in place
import app from '../pending';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePendingLink(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_LINK_ID,
    student_id: MOCK_STUDENT_ID,
    instructor_id: MOCK_INSTRUCTOR_ID,
    status: 'pending',
    invited_at: '2026-05-26T00:00:00Z',
    user_profiles: {
      full_name: 'Ana Silva',
      email: 'ana@example.com',
    },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/instructor-student-links/pending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1: Returns 401 without token
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await app.request('/');

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  // AC-2: Returns 403 if role is not instructor
  it('returns 403 when caller is a student (role != instructor)', async () => {
    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Forbidden');
  });

  // AC-3: Returns empty list when no pending links
  it('returns 200 with empty links array when no pending requests exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await app.request('/', { headers: instructorHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { links: unknown[] };
    expect(json.links).toEqual([]);
  });

  // AC-4a: Returns pending links with student name and email
  it('returns 200 with pending links including student_name and student_email', async () => {
    const rawLink = makePendingLink();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [rawLink], error: null }),
    });

    const res = await app.request('/', { headers: instructorHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as {
      links: Array<{
        id: string;
        student_id: string;
        student_name: string;
        student_email: string;
        status: string;
        invited_at: string;
      }>;
    };
    expect(json.links).toHaveLength(1);
    const link = json.links[0];
    expect(link.id).toBe(MOCK_LINK_ID);
    expect(link.student_id).toBe(MOCK_STUDENT_ID);
    expect(link.student_name).toBe('Ana Silva');
    expect(link.student_email).toBe('ana@example.com');
    expect(link.status).toBe('pending');
    expect(link.invited_at).toBe('2026-05-26T00:00:00Z');
  });

  // AC-4b: Returns only the authenticated instructor's pending links (LGPD isolation)
  it('returns only links belonging to the authenticated instructor, not other instructors', async () => {
    // Only links from MOCK_INSTRUCTOR_ID are returned; RLS on Supabase enforces this,
    // but the handler uses eq('instructor_id', auth.userId) as defense in depth.
    const ownLink = makePendingLink({ id: MOCK_LINK_ID, student_id: MOCK_STUDENT_ID });
    // The other instructor's link should NOT be returned — we simulate the DB already
    // filtering via RLS, so the mock returns only the own link.
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [ownLink], error: null }),
    });

    const res = await app.request('/', { headers: instructorHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { links: Array<{ id: string }> };
    expect(json.links).toHaveLength(1);
    expect(json.links[0].id).toBe(MOCK_LINK_ID);
  });

  // AC-5: Returns 500 when DB query fails
  it('returns 500 when database query fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    });

    const res = await app.request('/', { headers: instructorHeaders });

    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('InternalServerError');
  });

  // AC-6: Returns links for multiple students when they exist
  it('returns all pending links when multiple students have sent requests', async () => {
    const link1 = makePendingLink({ id: MOCK_LINK_ID,  student_id: MOCK_STUDENT_ID });
    const link2 = makePendingLink({
      id: MOCK_LINK_ID2,
      student_id: MOCK_STUDENT_ID2,
      user_profiles: { full_name: 'Beatriz Costa', email: 'bea@example.com' },
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [link1, link2], error: null }),
    });

    const res = await app.request('/', { headers: instructorHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { links: Array<{ student_name: string }> };
    expect(json.links).toHaveLength(2);
    expect(json.links.map((l) => l.student_name)).toContain('Ana Silva');
    expect(json.links.map((l) => l.student_name)).toContain('Beatriz Costa');
  });

  // Clinical constraint: no clinical/cycle data in this response
  it('never includes clinical data (stamps, cycles, observations) in the response', async () => {
    const rawLink = makePendingLink();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [rawLink], error: null }),
    });

    const res = await app.request('/', { headers: instructorHeaders });
    const body = await res.text();

    expect(body).not.toMatch(/fertil/i);
    expect(body).not.toMatch(/infertil/i);
    expect(body).not.toMatch(/seguro/i);
    expect(body).not.toMatch(/inseguro/i);
    expect(body).not.toMatch(/stamp/i);
    expect(body).not.toMatch(/cycle/i);
  });
});

// ─── verify the handler calls eq('instructor_id', ...) for defense-in-depth ──
describe('GET /pending — defense-in-depth: explicit instructor_id filter', () => {
  it('calls .eq with instructor_id = auth.userId on every request', async () => {
    const mockEq = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: mockEq,
      order: mockOrder,
    });

    await app.request('/', { headers: instructorHeaders });

    // The handler must explicitly filter by instructor_id regardless of RLS
    const eqCalls = mockEq.mock.calls as [string, unknown][];
    const hasInstructorFilter = eqCalls.some(
      ([col, val]) => col === 'instructor_id' && val === MOCK_INSTRUCTOR_ID,
    );
    expect(hasInstructorFilter).toBe(true);
  });

  it('calls .eq with status = pending to filter correctly', async () => {
    const mockEq = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: mockEq,
      order: mockOrder,
    });

    await app.request('/', { headers: instructorHeaders });

    const eqCalls = mockEq.mock.calls as [string, unknown][];
    const hasStatusFilter = eqCalls.some(
      ([col, val]) => col === 'status' && val === 'pending',
    );
    expect(hasStatusFilter).toBe(true);
  });
});
