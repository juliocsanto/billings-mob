/**
 * Integration tests — GET/POST /api/instructor-student-links
 *
 * Tests Hono handlers in-process using app.request().
 * Supabase clients are mocked via vi.mock to avoid needing a real DB.
 *
 * Coverage targets:
 *   - api/instructor-student-links/index.ts: all branches
 *   - GET /: empty list, populated list, DB failure, no auth
 *   - POST /: student creates invite, instructor forbidden, self-link, invalid UUID,
 *             unique constraint, check constraint, null insert, no auth, audit log
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOCK_STUDENT_ID    = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_INSTRUCTOR_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
const MOCK_LINK_ID       = 'f47ac10b-58cc-4372-a567-0e02b2c3d485';
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
const mockAuditInsert = vi.fn();
const mockServiceFrom = vi.fn(() => ({ insert: mockAuditInsert }));
const mockFrom = vi.fn();

vi.mock('../_lib/supabaseClient', () => ({
  // SEC-003 FIX: requireAuth reads role from user_profiles table. The 'from' factory must
  // handle 'user_profiles' queries (role lookup) separately from handler-specific queries.
  createAuthenticatedClient: vi.fn((jwt: string) => {
    const isInstructor = jwt.includes('instructor');
    const resolvedRole = isInstructor ? 'instructor' : 'student';
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
    from: mockServiceFrom,
  })),
}));

import app from '../instructor-student-links/index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_LINK_ID,
    instructor_id: MOCK_INSTRUCTOR_ID,
    student_id: MOCK_STUDENT_ID,
    status: 'pending',
    invited_at: '2026-05-26T00:00:00Z',
    accepted_at: null,
    revoked_at: null,
    revoked_by: null,
    ...overrides,
  };
}

// ─── GET /api/instructor-student-links ───────────────────────────────────────

describe('GET /api/instructor-student-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  it('returns 200 with empty array when no links exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: unknown[] };
    expect(json.data).toEqual([]);
  });

  it('returns 200 with list of links', async () => {
    const link = makeLink();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [link], error: null }),
    });

    const res = await app.request('/', { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof link[] };
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(MOCK_LINK_ID);
    expect(json.data[0].status).toBe('pending');
  });

  it('returns 500 when DB query fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    });

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
});

// ─── POST /api/instructor-student-links ──────────────────────────────────────

describe('POST /api/instructor-student-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  const validBody = { instructor_id: MOCK_INSTRUCTOR_ID };

  it('student creates invite with status pending and returns 201', async () => {
    const created = makeLink();
    const mockInsert = vi.fn().mockReturnThis();
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi.fn().mockResolvedValue({ data: created, error: null });

    mockFrom.mockReturnValue({
      insert: mockInsert,
      select: mockSelect,
      single: mockSingle,
    });

    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(201);
    const json = await res.json() as { data: typeof created };
    expect(json.data.id).toBe(MOCK_LINK_ID);
    expect(json.data.status).toBe('pending');

    // Verify insert was called with student_id and status: 'pending'
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: MOCK_STUDENT_ID,
        status: 'pending',
      })
    );
  });

  it('returns 403 when instructor tries to create invite', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: instructorHeaders,
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Forbidden');
  });

  it('returns 400 when instructor_id equals student_id (self-link)', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      // instructor_id same as student auth user id
      body: JSON.stringify({ instructor_id: MOCK_STUDENT_ID }),
    });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('BadRequest');
  });

  it('returns 400 when instructor_id is not a valid UUID', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ instructor_id: 'not-a-uuid' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 409 when unique constraint is violated (error code 23505)', async () => {
    const uniqueError = { code: '23505', message: 'duplicate key value violates unique constraint' };
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
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Conflict');
  });

  it('returns 400 when check constraint is violated (error code 23514)', async () => {
    const checkError = { code: '23514', message: 'check constraint violation' };
    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: checkError }),
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
    const json = await res.json() as { error: string };
    expect(json.error).toBe('InternalServerError');
  });

  it('returns 401 when no Authorization header provided', async () => {
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  it('audit log: records action LINK_INVITED after successful invite', async () => {
    const created = makeLink();
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
    expect(auditCall.action).toBe('LINK_INVITED');
    expect(auditCall.actor_id).toBe(MOCK_STUDENT_ID);
    expect(auditCall.entity_type).toBe('instructor_student_links');
  });
});
