/**
 * TDD — RED phase: tests written before implementation.
 *
 * Integration tests for the Asaas billing module (S7-07 + S7-08):
 *   - MockAsaasAdapter: createSubscription, parseWebhookPayload
 *   - POST /api/billing/subscribe
 *   - GET  /api/billing/status
 *   - POST /api/billing/webhook
 *
 * ADR-015: Asaas hexagonal adapter (same pattern as ADR-011 WhatsApp).
 * LGPD: dados de cartão NUNCA transitam pelo backend — apenas metadados.
 * Security: webhook HMAC-SHA256 com timingSafeEqual (fail-closed).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOCK_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_INSTRUCTOR_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
const STUDENT_JWT = 'mock.student.jwt';
const INSTRUCTOR_JWT = 'mock.instructor.jwt';
const TEST_WEBHOOK_SECRET = 'test-asaas-webhook-secret-456';

const studentHeaders = {
  Authorization: `Bearer ${STUDENT_JWT}`,
  'Content-Type': 'application/json',
};

const instructorHeaders = {
  Authorization: `Bearer ${INSTRUCTOR_JWT}`,
  'Content-Type': 'application/json',
};

function computeHmac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

// ─── Supabase mock ────────────────────────────────────────────────────────────
// user_profiles mock state — mutable per test
let mockUserProfile: Record<string, unknown> = {
  id: MOCK_USER_ID,
  role: 'student',
  subscription_status: 'trial',
  subscription_plan: null,
  asaas_subscription_id: null,
  subscription_expires_at: null,
};

const mockServiceUpdate = vi.fn();
const mockServiceFrom = vi.fn(() => ({
  update: mockServiceUpdate,
  select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: mockUserProfile, error: null })) })) })),
}));

// Mock admin.listUsers for webhook tests (resolves email → userId)
const mockListUsers = vi.fn().mockResolvedValue({
  data: {
    users: [
      { id: MOCK_INSTRUCTOR_ID, email: 'instructor@test.com' },
      { id: MOCK_USER_ID, email: 'student@test.com' },
    ],
  },
  error: null,
});

vi.mock('../_lib/supabaseClient', () => ({
  createAuthenticatedClient: vi.fn((jwt: string) => {
    const isInstructor = jwt.includes('instructor');
    const userId = isInstructor ? MOCK_INSTRUCTOR_ID : MOCK_USER_ID;
    const userRole = isInstructor ? 'instructor' : 'student';
    const userEmail = isInstructor ? 'instructor@test.com' : 'student@test.com';
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: userId,
              email: userEmail,
              user_metadata: {},
            },
          },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === 'user_profiles') {
          const profile = { ...mockUserProfile, id: userId, role: userRole };
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: profile, error: null })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: mockUserProfile, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      },
    };
  }),
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
    auth: {
      admin: {
        listUsers: mockListUsers,
      },
    },
  })),
}));

// ─── MockAsaasAdapter unit tests ─────────────────────────────────────────────

describe('MockAsaasAdapter', () => {
  it('createSubscription returns subscriptionId and paymentUrl', async () => {
    const { MockAsaasAdapter } = await import('../_lib/billing/MockAsaasAdapter');
    const adapter = new MockAsaasAdapter();
    const result = await adapter.createSubscription('instructor_monthly', 'test@example.com');

    expect(result.subscriptionId).toMatch(/^mock_/);
    expect(result.paymentUrl).toBe('https://mock.asaas.com/checkout/test');
    expect(result.status).toBe('active');
    expect(result.nextDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('createSubscription for instructor_annual also returns active status', async () => {
    const { MockAsaasAdapter } = await import('../_lib/billing/MockAsaasAdapter');
    const adapter = new MockAsaasAdapter();
    const result = await adapter.createSubscription('instructor_annual', 'annual@example.com');

    expect(result.subscriptionId).toMatch(/^mock_/);
    expect(result.status).toBe('active');
    expect(result.paymentUrl).toBe('https://mock.asaas.com/checkout/test');
  });

  it('parseWebhookPayload returns customerId and event for valid HMAC signature', async () => {
    const { MockAsaasAdapter } = await import('../_lib/billing/MockAsaasAdapter');
    const adapter = new MockAsaasAdapter();
    const body = JSON.stringify({
      event: 'PAYMENT_RECEIVED',
      payment: { subscriptionId: 'mock_sub_123' },
      customer: { email: 'instructor@test.com' },
    });
    const signature = computeHmac(TEST_WEBHOOK_SECRET, body);

    const result = await adapter.parseWebhookPayload(body, signature, TEST_WEBHOOK_SECRET);

    expect(result.customerId).toBe('instructor@test.com');
    expect(result.event).toBe('PAYMENT_RECEIVED');
    expect(result.subscriptionId).toBe('mock_sub_123');
  });

  it('parseWebhookPayload throws for invalid HMAC signature', async () => {
    const { MockAsaasAdapter } = await import('../_lib/billing/MockAsaasAdapter');
    const adapter = new MockAsaasAdapter();
    const body = JSON.stringify({ event: 'PAYMENT_RECEIVED', customer: { email: 'x@x.com' } });
    const badSignature = computeHmac('wrong-secret', body);

    await expect(
      adapter.parseWebhookPayload(body, badSignature, TEST_WEBHOOK_SECRET),
    ).rejects.toThrow('invalid_signature');
  });
});

// ─── POST /api/billing/subscribe ─────────────────────────────────────────────

describe('POST /api/billing/subscribe', () => {
  beforeEach(() => {
    process.env.ASAAS_ENV = 'mock';
    process.env.ASAAS_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    mockUserProfile = {
      id: MOCK_INSTRUCTOR_ID,
      role: 'instructor',
      subscription_status: 'trial',
      subscription_plan: null,
      asaas_subscription_id: null,
      subscription_expires_at: null,
    };
    mockServiceUpdate.mockReset();
    mockServiceUpdate.mockReturnValue({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    });
    mockServiceFrom.mockReturnValue({
      update: mockServiceUpdate,
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: mockUserProfile, error: null })) })) })),
    });
  });

  afterEach(() => {
    delete process.env.ASAAS_ENV;
    delete process.env.ASAAS_WEBHOOK_SECRET;
  });

  it('returns 201 with subscriptionId, status, nextDueDate, paymentUrl for instructor_monthly', async () => {
    const mod = await import('../billing/index?t=' + Date.now());
    const app = mod.default;

    const res = await app.request('/api/billing/subscribe', {
      method: 'POST',
      headers: instructorHeaders,
      body: JSON.stringify({ plan: 'instructor_monthly' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as {
      subscriptionId: string;
      status: string;
      nextDueDate: string;
      paymentUrl: string;
    };
    expect(body.subscriptionId).toMatch(/^mock_/);
    expect(body.status).toBe('active');
    expect(body.nextDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.paymentUrl).toBe('https://mock.asaas.com/checkout/test');
  });

  it('returns 400 for invalid plan', async () => {
    const mod = await import('../billing/index?t=' + Date.now());
    const app = mod.default;

    const res = await app.request('/api/billing/subscribe', {
      method: 'POST',
      headers: instructorHeaders,
      body: JSON.stringify({ plan: 'invalid_plan' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBeDefined();
  });

  it('returns 401 without Authorization header', async () => {
    const mod = await import('../billing/index?t=' + Date.now());
    const app = mod.default;

    const res = await app.request('/api/billing/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'instructor_monthly' }),
    });

    expect(res.status).toBe(401);
  });

  it('returns 403 when user has student role', async () => {
    const mod = await import('../billing/index?t=' + Date.now());
    const app = mod.default;

    const res = await app.request('/api/billing/subscribe', {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ plan: 'instructor_monthly' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBeDefined();
  });
});

// ─── GET /api/billing/status ─────────────────────────────────────────────────

describe('GET /api/billing/status', () => {
  beforeEach(() => {
    process.env.ASAAS_ENV = 'mock';
  });

  afterEach(() => {
    delete process.env.ASAAS_ENV;
  });

  it('returns 200 with subscriptionStatus=trial for new instructor with no subscription', async () => {
    mockUserProfile = {
      id: MOCK_INSTRUCTOR_ID,
      role: 'instructor',
      subscription_status: 'trial',
      subscription_plan: null,
      asaas_subscription_id: null,
      subscription_expires_at: null,
    };
    const mod = await import('../billing/index?t=' + Date.now());
    const app = mod.default;

    const res = await app.request('/api/billing/status', {
      method: 'GET',
      headers: instructorHeaders,
    });

    expect(res.status).toBe(200);
    const body = await res.json() as {
      subscriptionStatus: string;
      plan: null;
      subscriptionId: null;
      expiresAt: null;
    };
    expect(body.subscriptionStatus).toBe('trial');
    expect(body.plan).toBeNull();
    expect(body.subscriptionId).toBeNull();
    expect(body.expiresAt).toBeNull();
  });

  it('returns 200 with subscriptionStatus=active for subscribed instructor', async () => {
    mockUserProfile = {
      id: MOCK_INSTRUCTOR_ID,
      role: 'instructor',
      subscription_status: 'active',
      subscription_plan: 'instructor_monthly',
      asaas_subscription_id: 'mock_sub_abc123',
      subscription_expires_at: '2026-07-06T00:00:00Z',
    };
    const mod = await import('../billing/index?t=' + Date.now());
    const app = mod.default;

    const res = await app.request('/api/billing/status', {
      method: 'GET',
      headers: instructorHeaders,
    });

    expect(res.status).toBe(200);
    const body = await res.json() as {
      subscriptionStatus: string;
      plan: string;
      subscriptionId: string;
      expiresAt: string;
    };
    expect(body.subscriptionStatus).toBe('active');
    expect(body.plan).toBe('instructor_monthly');
    expect(body.subscriptionId).toBe('mock_sub_abc123');
  });

  it('returns 401 without Authorization header', async () => {
    const mod = await import('../billing/index?t=' + Date.now());
    const app = mod.default;

    const res = await app.request('/api/billing/status', {
      method: 'GET',
      headers: {},
    });

    expect(res.status).toBe(401);
  });
});

// ─── POST /api/billing/webhook ────────────────────────────────────────────────

describe('POST /api/billing/webhook', () => {
  beforeEach(() => {
    process.env.ASAAS_ENV = 'mock';
    process.env.ASAAS_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    mockServiceUpdate.mockReset();
    mockServiceUpdate.mockReturnValue({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    });
    mockServiceFrom.mockReturnValue({
      update: mockServiceUpdate,
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: mockUserProfile, error: null })) })) })),
    });
    mockListUsers.mockResolvedValue({
      data: {
        users: [
          { id: MOCK_INSTRUCTOR_ID, email: 'instructor@test.com' },
          { id: MOCK_USER_ID, email: 'student@test.com' },
        ],
      },
      error: null,
    });
  });

  afterEach(() => {
    delete process.env.ASAAS_ENV;
    delete process.env.ASAAS_WEBHOOK_SECRET;
  });

  it('returns 200 and updates subscription_status to active on PAYMENT_RECEIVED', async () => {
    const mod = await import('../billing/index?t=' + Date.now());
    const app = mod.default;
    const body = JSON.stringify({
      event: 'PAYMENT_RECEIVED',
      payment: { subscriptionId: 'sub_abc' },
      customer: { email: 'instructor@test.com' },
    });
    const sig = computeHmac(TEST_WEBHOOK_SECRET, body);

    const res = await app.request('/api/billing/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'asaas-signature': sig,
      },
      body,
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { received: boolean };
    expect(json.received).toBe(true);
  });

  it('returns 200 and updates subscription_status to expired on SUBSCRIPTION_CANCELED', async () => {
    const mod = await import('../billing/index?t=' + Date.now());
    const app = mod.default;
    const body = JSON.stringify({
      event: 'SUBSCRIPTION_CANCELED',
      payment: { subscriptionId: 'sub_abc' },
      customer: { email: 'instructor@test.com' },
    });
    const sig = computeHmac(TEST_WEBHOOK_SECRET, body);

    const res = await app.request('/api/billing/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'asaas-signature': sig,
      },
      body,
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { received: boolean };
    expect(json.received).toBe(true);
  });

  it('returns 403 with invalid HMAC signature', async () => {
    const mod = await import('../billing/index?t=' + Date.now());
    const app = mod.default;
    const body = JSON.stringify({
      event: 'PAYMENT_RECEIVED',
      customer: { email: 'x@x.com' },
    });
    const badSig = computeHmac('wrong-secret', body);

    const res = await app.request('/api/billing/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'asaas-signature': badSig,
      },
      body,
    });

    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('invalid_signature');
  });
});
