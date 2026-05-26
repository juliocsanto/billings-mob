/**
 * Integration tests — PATCH /api/instructor-student-links/:id
 *
 * Tests Hono handlers in-process using app.request().
 * Supabase clients are mocked via vi.mock to avoid needing a real DB.
 *
 * Coverage targets:
 *   - api/instructor-student-links/[id].ts: all branches
 *   - accept action: instructor accepts pending, student forbidden, already active,
 *                    already revoked, not found, DB failure, audit log
 *   - revoke action: instructor revokes, student revokes own, student forbidden for other,
 *                    not found, DB failure, audit log
 *   - Validation: empty body, invalid action, strict mode (unknown field)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOCK_STUDENT_ID    = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_INSTRUCTOR_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
const OTHER_STUDENT_ID   = 'f47ac10b-58cc-4372-a567-0e02b2c3d499';
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
  createAuthenticatedClient: vi.fn((jwt: string) => {
    const isInstructor = jwt.includes('instructor');
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: isInstructor ? MOCK_INSTRUCTOR_ID : MOCK_STUDENT_ID,
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

import app from '../instructor-student-links/[id]';

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

/**
 * Builds a fetch-link mock (select/eq/single chain).
 */
function makeFetchChain(link: unknown, fetchError: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: link, error: fetchError }),
  };
}

/**
 * Builds an update-link mock (update/eq/select/single chain).
 */
function makeUpdateChain(updated: unknown, updateError: unknown = null) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: updated, error: updateError }),
  };
}

// ─── PATCH /:id — action 'accept' ────────────────────────────────────────────

describe("PATCH /:id — action 'accept'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  it('instructor accepts pending link and returns 200 with status active', async () => {
    const pendingLink = makeLink({ status: 'pending' });
    const updatedLink = makeLink({ status: 'active', accepted_at: '2026-05-26T10:00:00Z' });

    mockFrom
      .mockReturnValueOnce(makeFetchChain(pendingLink))
      .mockReturnValueOnce(makeUpdateChain(updatedLink));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'accept' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof updatedLink };
    expect(json.data.status).toBe('active');
    expect(json.data.accepted_at).toBeTruthy();
  });

  it('returns 403 when student tries to accept', async () => {
    const pendingLink = makeLink({ status: 'pending' });
    mockFrom.mockReturnValueOnce(makeFetchChain(pendingLink));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify({ action: 'accept' }),
    });

    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Forbidden');
  });

  it("returns 400 when link status is already 'active' (cannot accept twice)", async () => {
    const activeLink = makeLink({ status: 'active', accepted_at: '2026-05-25T00:00:00Z' });
    mockFrom.mockReturnValueOnce(makeFetchChain(activeLink));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'accept' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('BadRequest');
  });

  it("returns 400 when link status is 'revoked'", async () => {
    const revokedLink = makeLink({ status: 'revoked', revoked_at: '2026-05-25T00:00:00Z' });
    mockFrom.mockReturnValueOnce(makeFetchChain(revokedLink));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'accept' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('BadRequest');
  });

  it('returns 500 when link fetch fails (PGRST116 treated as infra error)', async () => {
    mockFrom.mockReturnValueOnce(makeFetchChain(null, { code: 'PGRST116' }));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'accept' }),
    });

    expect(res.status).toBe(500);
  });

  it('returns 500 when update query fails', async () => {
    const pendingLink = makeLink({ status: 'pending' });
    mockFrom
      .mockReturnValueOnce(makeFetchChain(pendingLink))
      .mockReturnValueOnce(makeUpdateChain(null, new Error('Update failed')));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'accept' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('InternalServerError');
  });

  it('returns 401 when no Authorization header provided', async () => {
    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'accept' }),
    });

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  it('audit log: records action LINK_ACCEPTED after successful accept', async () => {
    const pendingLink = makeLink({ status: 'pending' });
    const updatedLink = makeLink({ status: 'active', accepted_at: '2026-05-26T10:00:00Z' });

    mockFrom
      .mockReturnValueOnce(makeFetchChain(pendingLink))
      .mockReturnValueOnce(makeUpdateChain(updatedLink));

    await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'accept' }),
    });

    expect(mockAuditInsert).toHaveBeenCalled();
    const auditCall = mockAuditInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(auditCall.action).toBe('LINK_ACCEPTED');
    expect(auditCall.actor_id).toBe(MOCK_INSTRUCTOR_ID);
    expect(auditCall.entity_id).toBe(MOCK_LINK_ID);
  });
});

// ─── PATCH /:id — action 'revoke' ────────────────────────────────────────────

describe("PATCH /:id — action 'revoke'", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  it('instructor revokes link and returns 200', async () => {
    const activeLink = makeLink({ status: 'active', accepted_at: '2026-05-25T00:00:00Z' });
    const revokedLink = makeLink({
      status: 'revoked',
      revoked_at: '2026-05-26T10:00:00Z',
      revoked_by: MOCK_INSTRUCTOR_ID,
    });

    mockFrom
      .mockReturnValueOnce(makeFetchChain(activeLink))
      .mockReturnValueOnce(makeUpdateChain(revokedLink));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'revoke' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof revokedLink };
    expect(json.data.status).toBe('revoked');
    expect(json.data.revoked_by).toBe(MOCK_INSTRUCTOR_ID);
  });

  it('student revokes their own link and returns 200', async () => {
    // Link where student_id === auth.userId (MOCK_STUDENT_ID from STUDENT_JWT)
    const activeLink = makeLink({
      status: 'active',
      student_id: MOCK_STUDENT_ID,
      accepted_at: '2026-05-25T00:00:00Z',
    });
    const revokedLink = makeLink({
      status: 'revoked',
      student_id: MOCK_STUDENT_ID,
      revoked_at: '2026-05-26T10:00:00Z',
      revoked_by: MOCK_STUDENT_ID,
    });

    mockFrom
      .mockReturnValueOnce(makeFetchChain(activeLink))
      .mockReturnValueOnce(makeUpdateChain(revokedLink));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify({ action: 'revoke' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: typeof revokedLink };
    expect(json.data.status).toBe('revoked');
  });

  it('returns 403 when student tries to revoke a link belonging to another student', async () => {
    // Link where student_id !== auth.userId
    const otherStudentLink = makeLink({
      status: 'active',
      student_id: OTHER_STUDENT_ID,
      accepted_at: '2026-05-25T00:00:00Z',
    });

    // Student JWT resolves to MOCK_STUDENT_ID, but link.student_id is OTHER_STUDENT_ID
    mockFrom.mockReturnValueOnce(makeFetchChain(otherStudentLink));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: studentHeaders,
      body: JSON.stringify({ action: 'revoke' }),
    });

    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Forbidden');
  });

  it('returns 500 when link fetch fails (PGRST116 treated as infra error)', async () => {
    mockFrom.mockReturnValueOnce(makeFetchChain(null, { code: 'PGRST116' }));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'revoke' }),
    });

    expect(res.status).toBe(500);
  });

  it('returns 500 when update query fails', async () => {
    const activeLink = makeLink({ status: 'active' });
    mockFrom
      .mockReturnValueOnce(makeFetchChain(activeLink))
      .mockReturnValueOnce(makeUpdateChain(null, new Error('Update failed')));

    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'revoke' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('InternalServerError');
  });

  it('returns 401 when no Authorization header provided', async () => {
    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'revoke' }),
    });

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  it('audit log: records action LINK_REVOKED after successful revoke', async () => {
    const activeLink = makeLink({ status: 'active', accepted_at: '2026-05-25T00:00:00Z' });
    const revokedLink = makeLink({
      status: 'revoked',
      revoked_at: '2026-05-26T10:00:00Z',
      revoked_by: MOCK_INSTRUCTOR_ID,
    });

    mockFrom
      .mockReturnValueOnce(makeFetchChain(activeLink))
      .mockReturnValueOnce(makeUpdateChain(revokedLink));

    await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'revoke' }),
    });

    expect(mockAuditInsert).toHaveBeenCalled();
    const auditCall = mockAuditInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(auditCall.action).toBe('LINK_REVOKED');
    expect(auditCall.actor_id).toBe(MOCK_INSTRUCTOR_ID);
    expect(auditCall.entity_id).toBe(MOCK_LINK_ID);
  });
});

// ─── PATCH /:id — validation ─────────────────────────────────────────────────

describe('PATCH /:id — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockServiceFrom.mockReturnValue({ insert: mockAuditInsert });
  });

  it('returns 400 when body is empty', async () => {
    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when action is invalid (e.g. 'delete')", async () => {
    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'delete' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when body contains an unknown field (strict mode)', async () => {
    const res = await app.request(`/${MOCK_LINK_ID}`, {
      method: 'PATCH',
      headers: instructorHeaders,
      body: JSON.stringify({ action: 'accept', unknownField: 'value' }),
    });

    expect(res.status).toBe(400);
  });
});
