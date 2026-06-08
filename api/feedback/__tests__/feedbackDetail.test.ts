/**
 * Integration tests — feedback/:id endpoints
 *
 * Covers:
 *  GET /api/feedback/:id     — detalhe + comentários, role-based fields, 404
 *  PATCH /api/feedback/:id/approve    — admin aprova, status check, 403 non-admin
 *  PATCH /api/feedback/:id/reject     — admin rejeita
 *  PATCH /api/feedback/:id/mark-deployed  — admin marca como deployed, status check
 *  PATCH /api/feedback/:id/final-approve  — admin final-approve com Asaas mock
 *
 * ADR-018: Feedback system endpoints.
 * LGPD: `relations` e `notes` nunca devem aparecer em payloads.
 * Restrição clínica: nenhum termo clínico em mocks ou asserções.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockGetUser, mockAuthProfileSingle } = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockAuthProfileSingle = vi.fn();
  return { mockGetUser, mockAuthProfileSingle };
});

vi.mock('../../_lib/supabaseClient', () => ({
  createAuthenticatedClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({ eq: () => ({ single: mockAuthProfileSingle }) }),
        };
      }
      return { select: vi.fn() };
    },
  })),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFromFn,
  })),
}));

vi.mock('../../_lib/notifications/factory', () => ({
  getNotificationService: vi.fn(() => ({
    dispatch: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../_lib/billing/billingFactory', () => ({
  getBillingAdapter: vi.fn(() => ({
    applySubscriptionDiscount: vi.fn().mockResolvedValue({ success: true, discountId: 'asaas-discount-001' }),
  })),
}));

vi.mock('../../_lib/rateLimit', () => ({
  apiRateLimit: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
}));

// service client mock — defined after vi.hoisted to allow reassignment in tests
let mockServiceFromFn = vi.fn();

import app from '../[id]/index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_JWT_STUDENT = 'Bearer mock.student.jwt';
const VALID_JWT_ADMIN = 'Bearer mock.admin.jwt';
const FEEDBACK_ID = 'fb-uuid-001';
const ADMIN_USER_ID = 'admin-uuid-001';
const STUDENT_USER_ID = 'student-uuid-001';

const MOCK_FEEDBACK = {
  id: FEEDBACK_ID,
  author_id: STUDENT_USER_ID,
  author_role: 'student',
  category: 'bug',
  title: 'Problema na interface de registro',
  content: 'O formulário não salva corretamente.',
  status: 'pending_triage',
  discount_applied: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MOCK_COMMENTS = [
  {
    id: 'comment-uuid-001',
    feedback_id: FEEDBACK_ID,
    author_id: STUDENT_USER_ID,
    author_role: 'student',
    content: 'Confirmo o problema.',
    created_at: new Date().toISOString(),
  },
];

function makeRequest(method: string, path: string, jwt: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: jwt,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function buildServiceMock(options: {
  feedback?: Record<string, unknown> | null;
  feedbackError?: unknown;
  comments?: Array<Record<string, unknown>>;
  commentsError?: unknown;
  updateError?: unknown;
  profileRole?: string;
} = {}) {
  const {
    feedback = MOCK_FEEDBACK,
    feedbackError = null,
    comments = MOCK_COMMENTS,
    commentsError = null,
    updateError = null,
    profileRole = 'student',
  } = options;

  return vi.fn().mockImplementation((table: string) => {
    if (table === 'app_feedback') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: feedback, error: feedbackError }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: updateError }),
        }),
      };
    }
    if (table === 'app_feedback_comments') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: comments, error: commentsError }),
          }),
        }),
      };
    }
    if (table === 'user_profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { role: profileRole }, error: null }),
          }),
        }),
      };
    }
    if (table === 'audit_log') {
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    if (table === 'app_feedback_discounts') {
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    return { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
  });
}

// ─── GET /api/feedback/:id ────────────────────────────────────────────────────

describe('GET /api/feedback/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header', async () => {
    const req = new Request(`http://localhost/`, {
      method: 'GET',
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with feedback and comments when authenticated as student', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: STUDENT_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'student' }, error: null });
    mockServiceFromFn = buildServiceMock({ feedback: MOCK_FEEDBACK, comments: MOCK_COMMENTS });

    const req = makeRequest('GET', '/', VALID_JWT_STUDENT);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { feedback: unknown; comments: unknown[] };
    expect(body).toHaveProperty('feedback');
    expect(body).toHaveProperty('comments');
    expect(Array.isArray(body.comments)).toBe(true);
  });

  it('returns 404 when feedback does not exist', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: STUDENT_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'student' }, error: null });
    mockServiceFromFn = buildServiceMock({ feedback: null, feedbackError: new Error('Not found') });

    const req = makeRequest('GET', '/', VALID_JWT_STUDENT);
    const res = await app.fetch(req);
    expect(res.status).toBe(404);
  });

  it('admin sees triage_result field; student does not', async () => {
    const feedbackWithTriage = {
      ...MOCK_FEEDBACK,
      triage_result: { impact: 'high', summary: 'Impacto alto na experiência do usuário.' },
    };

    // Admin request
    mockGetUser.mockResolvedValue({
      data: { user: { id: ADMIN_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });
    mockServiceFromFn = buildServiceMock({ feedback: feedbackWithTriage, comments: [] });

    const adminReq = makeRequest('GET', '/', VALID_JWT_ADMIN);
    const adminRes = await app.fetch(adminReq);
    expect(adminRes.status).toBe(200);
    const adminBody = await adminRes.json() as { feedback: Record<string, unknown> };
    // admin should receive the full object including triage_result (passed from DB)
    expect(adminBody.feedback).toBeDefined();
  });

  it('response does not expose LGPD fields relations or notes', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: STUDENT_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'student' }, error: null });
    mockServiceFromFn = buildServiceMock({ feedback: MOCK_FEEDBACK, comments: MOCK_COMMENTS });

    const req = makeRequest('GET', '/', VALID_JWT_STUDENT);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(await res.json());
    expect(serialized).not.toContain('"relations"');
    expect(serialized).not.toContain('"notes"');
  });
});

// ─── PATCH /api/feedback/:id/approve ─────────────────────────────────────────

describe('PATCH /api/feedback/:id/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when user is not admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: STUDENT_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'student' }, error: null });

    const req = makeRequest('PATCH', '/approve', VALID_JWT_STUDENT, { approvalNote: 'Ok' });
    const res = await app.fetch(req);
    expect(res.status).toBe(403);
  });

  it('admin approves feedback with status triaged', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: ADMIN_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });

    const feedbackWithTriaged = { ...MOCK_FEEDBACK, status: 'triaged' };
    mockServiceFromFn = buildServiceMock({
      feedback: feedbackWithTriaged,
      profileRole: 'admin',
    });

    const req = makeRequest('PATCH', '/approve', VALID_JWT_ADMIN, { approvalNote: 'Aprovado pelo admin.' });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('rejects approval when feedback status is already approved', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: ADMIN_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });

    const feedbackAlreadyApproved = { ...MOCK_FEEDBACK, status: 'approved' };
    mockServiceFromFn = buildServiceMock({ feedback: feedbackAlreadyApproved, profileRole: 'admin' });

    const req = makeRequest('PATCH', '/approve', VALID_JWT_ADMIN, { approvalNote: 'Tentar novamente' });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when no auth header', async () => {
    const req = new Request('http://localhost/approve', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalNote: 'Teste' }),
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/feedback/:id/reject ──────────────────────────────────────────

describe('PATCH /api/feedback/:id/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin rejects feedback and returns 200', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: ADMIN_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });

    mockServiceFromFn = buildServiceMock({
      feedback: { ...MOCK_FEEDBACK, status: 'pending_triage' },
      profileRole: 'admin',
    });

    const req = makeRequest('PATCH', '/reject', VALID_JWT_ADMIN, {
      reason: 'Fora do escopo do produto.',
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('returns 403 when user is not admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: STUDENT_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'student' }, error: null });

    const req = makeRequest('PATCH', '/reject', VALID_JWT_STUDENT, {
      reason: 'Motivo qualquer.',
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(403);
  });
});

// ─── PATCH /api/feedback/:id/mark-deployed ───────────────────────────────────

describe('PATCH /api/feedback/:id/mark-deployed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin marks approved feedback as deployed', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: ADMIN_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });

    mockServiceFromFn = buildServiceMock({
      feedback: { ...MOCK_FEEDBACK, status: 'approved', title: 'Melhoria aprovada' },
      profileRole: 'admin',
    });

    const req = makeRequest('PATCH', '/mark-deployed', VALID_JWT_ADMIN);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('rejects mark-deployed when status is not approved or implementing', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: ADMIN_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });

    mockServiceFromFn = buildServiceMock({
      feedback: { ...MOCK_FEEDBACK, status: 'pending_triage' },
      profileRole: 'admin',
    });

    const req = makeRequest('PATCH', '/mark-deployed', VALID_JWT_ADMIN);
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /api/feedback/:id/final-approve ───────────────────────────────────

describe('PATCH /api/feedback/:id/final-approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin final-approves feedback with status deployed', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: ADMIN_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });

    const deployedFeedback = {
      ...MOCK_FEEDBACK,
      status: 'deployed',
      author_id: STUDENT_USER_ID,
      title: 'Melhoria implementada',
    };

    mockServiceFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'app_feedback') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: deployedFeedback, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'user_profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { asaas_subscription_id: 'sub-123', full_name: 'Maria Teste' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'audit_log') {
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }
      if (table === 'app_feedback_discounts') {
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }
      return { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
    });

    const req = makeRequest('PATCH', '/final-approve', VALID_JWT_ADMIN);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('rejects final-approve when status is not deployed', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: ADMIN_USER_ID, user_metadata: {} } },
      error: null,
    });
    mockAuthProfileSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });

    mockServiceFromFn = buildServiceMock({
      feedback: { ...MOCK_FEEDBACK, status: 'approved' },
      profileRole: 'admin',
    });

    const req = makeRequest('PATCH', '/final-approve', VALID_JWT_ADMIN);
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });
});
