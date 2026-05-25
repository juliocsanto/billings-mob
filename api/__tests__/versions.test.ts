/**
 * Integration tests — GET /api/observations/versions/pending
 *                      PATCH /api/observations/versions/:id/resolve
 *
 * Tests the versions/index.ts handler including:
 *   - Instructor-only access enforcement
 *   - List pending conflicts (GET /pending)
 *   - Resolve conflict: keep instructor (PATCH /:id/resolve)
 *   - Resolve conflict: keep student (PATCH /:id/resolve)
 *   - LGPD: no relations/notes in audit_log
 *   - ADR-004: system never auto-resolves conflicts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOCK_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_CYCLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d481';
const MOCK_OBS_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d482';
const MOCK_VERSION_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d483';
const STUDENT_VERSION_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d484';

const STUDENT_JWT = 'mock.student.jwt';
const INSTRUCTOR_JWT = 'mock.instructor.jwt';

const studentHeaders = {
  Authorization: `Bearer ${STUDENT_JWT}`,
  'Content-Type': 'application/json',
};

const instructorHeaders = {
  Authorization: `Bearer ${INSTRUCTOR_JWT}`,
  'Content-Type': 'application/json',
};

// ─── Mocks ───────────────────────────────────────────────────────────────────
const mockAuditInsert = vi.fn();
const mockServiceFrom = vi.fn(() => ({ insert: mockAuditInsert }));
const mockFrom = vi.fn();

vi.mock('../_lib/supabaseClient', () => ({
  createAuthenticatedClient: vi.fn((jwt: string) => {
    const isInstructor = jwt.includes('instructor');
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: isInstructor
                ? 'f47ac10b-58cc-4372-a567-0e02b2c3d480'
                : 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
              user_metadata: { role: isInstructor ? 'instructor' : 'student' },
            },
          },
          error: null,
        }),
      },
      from: mockFrom,
    };
  }),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

import app from '../observations/versions/index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePendingVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_VERSION_ID,
    observation_id: MOCK_OBS_ID,
    vector_clock: { [MOCK_USER_ID]: 1 },
    data: {
      stamp: 'seco',
      mucus: null,
      bleeding: null,
      cycle_id: MOCK_CYCLE_ID,
      version: 1,
    },
    author_id: MOCK_USER_ID,
    author_role: 'student',
    created_at: '2026-05-25T00:00:00Z',
    conflict_resolved: false,
    observations: {
      id: MOCK_OBS_ID,
      date: '2026-05-25',
      stamp: 'muco',
      mucus: 'elastico',
      bleeding: null,
      version: 2,
      user_id: MOCK_USER_ID,
      cycle_id: MOCK_CYCLE_ID,
    },
    ...overrides,
  };
}

// ─── GET /pending ─────────────────────────────────────────────────────────────

describe('GET /pending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  it('returns 200 with pending conflicts for instructor', async () => {
    const version = makePendingVersion();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [version], error: null }),
    });

    const res = await app.request('/pending', { headers: instructorHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof version[]; count: number };
    expect(json.data).toHaveLength(1);
    expect(json.count).toBe(1);
    expect(json.data[0].conflict_resolved).toBe(false);
  });

  it('returns 200 with empty list when no pending conflicts', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await app.request('/pending', { headers: instructorHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: unknown[]; count: number };
    expect(json.data).toEqual([]);
    expect(json.count).toBe(0);
  });

  it('returns 403 when a student tries to access pending conflicts', async () => {
    const res = await app.request('/pending', { headers: studentHeaders });

    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Forbidden');
  });

  it('returns 500 when DB query fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    });

    const res = await app.request('/pending', { headers: instructorHeaders });

    expect(res.status).toBe(500);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.request('/pending');

    expect(res.status).toBe(401);
  });
});

// ─── PATCH /:id/resolve — keep instructor ─────────────────────────────────────

describe('PATCH /:id/resolve — keep instructor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  const keepInstructorBody = { keep: 'instructor' };

  it('resolves conflict (keep instructor) and returns 200', async () => {
    const conflictVersion = makePendingVersion();

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: conflictVersion, error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

    const res = await app.request(`/${MOCK_VERSION_ID}/resolve`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify(keepInstructorBody),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as {
      data: { version_id: string; conflict_resolved: boolean; kept_version: string };
    };
    expect(json.data.conflict_resolved).toBe(true);
    expect(json.data.kept_version).toBe('instructor');
    expect(json.data.version_id).toBe(MOCK_VERSION_ID);
  });

  it('LGPD: audit_log does NOT contain relations or notes', async () => {
    const conflictVersion = makePendingVersion();

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: conflictVersion, error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

    await app.request(`/${MOCK_VERSION_ID}/resolve`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify(keepInstructorBody),
    });

    expect(mockAuditInsert).toHaveBeenCalled();
    const auditPayload = mockAuditInsert.mock.calls[0][0] as Record<string, unknown>;
    const auditStr = JSON.stringify(auditPayload);
    expect(auditStr).not.toContain('"relations"');
    expect(auditStr).not.toContain('"notes"');
  });

  it('returns 403 when student tries to resolve conflict', async () => {
    const res = await app.request(`/${MOCK_VERSION_ID}/resolve`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify(keepInstructorBody),
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 when conflict version not found', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    const res = await app.request(`/${MOCK_VERSION_ID}/resolve`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify(keepInstructorBody),
    });

    expect(res.status).toBe(404);
  });

  it('returns 500 when marking resolved fails', async () => {
    const conflictVersion = makePendingVersion();

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: conflictVersion, error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: new Error('Update failed') }),
      });

    const res = await app.request(`/${MOCK_VERSION_ID}/resolve`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify(keepInstructorBody),
    });

    expect(res.status).toBe(500);
  });

  it('returns 400 when keep is "student" but student_version_id is missing', async () => {
    const res = await app.request(`/${MOCK_VERSION_ID}/resolve`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ keep: 'student' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await app.request(`/${MOCK_VERSION_ID}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify(keepInstructorBody),
    });

    expect(res.status).toBe(401);
  });
});

// ─── PATCH /:id/resolve — keep student ───────────────────────────────────────

describe('PATCH /:id/resolve — keep student', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  const keepStudentBody = {
    keep: 'student',
    student_version_id: STUDENT_VERSION_ID,
  };

  it('resolves conflict (keep student) by restoring student version data', async () => {
    const conflictVersion = makePendingVersion();
    const studentVersion = {
      id: STUDENT_VERSION_ID,
      observation_id: MOCK_OBS_ID,
      vector_clock: { [MOCK_USER_ID]: 1 },
      data: {
        stamp: 'sangramento',
        mucus: null,
        bleeding: 'leve',
        cycle_id: MOCK_CYCLE_ID,
        version: 1,
      },
    };

    mockFrom
      // Fetch conflict version
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: conflictVersion, error: null }),
      })
      // Fetch student version
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: studentVersion, error: null }),
      })
      // Restore observation to student data
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      // Mark conflict_resolved = true
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

    const res = await app.request(`/${MOCK_VERSION_ID}/resolve`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify(keepStudentBody),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { kept_version: string; conflict_resolved: boolean } };
    expect(json.data.kept_version).toBe('student');
    expect(json.data.conflict_resolved).toBe(true);
  });

  it('returns 404 when student version not found', async () => {
    const conflictVersion = makePendingVersion();

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: conflictVersion, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      });

    const res = await app.request(`/${MOCK_VERSION_ID}/resolve`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify(keepStudentBody),
    });

    expect(res.status).toBe(404);
  });

  it('returns 500 when restore observation update fails', async () => {
    const conflictVersion = makePendingVersion();
    const studentVersion = {
      id: STUDENT_VERSION_ID,
      observation_id: MOCK_OBS_ID,
      vector_clock: { [MOCK_USER_ID]: 1 },
      data: { stamp: 'seco', mucus: null, bleeding: null, cycle_id: MOCK_CYCLE_ID, version: 1 },
    };

    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: conflictVersion, error: null }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: studentVersion, error: null }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: new Error('Restore failed') }),
      });

    const res = await app.request(`/${MOCK_VERSION_ID}/resolve`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify(keepStudentBody),
    });

    expect(res.status).toBe(500);
  });
});
