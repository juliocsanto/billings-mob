/**
 * Unit tests — AsaasCloudAdapter (api/_lib/billing/AsaasCloudAdapter.ts)
 *
 * Strategy: vi.spyOn(global, 'fetch') to mock all HTTP calls.
 * No real network requests are made.
 *
 * ADR-015: Asaas hexagonal adapter.
 * LGPD: only email + plan metadata transit — never card data.
 * Security: parseWebhookPayload HMAC-SHA256 via timingSafeEqual.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { AsaasCloudAdapter } from '../_lib/billing/AsaasCloudAdapter';

// ── Helpers ────────────────────────────────────────────────────────────────────

function hmac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function mockFetchOk(body: unknown): void {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

function mockFetchError(status: number, errors?: Array<{ description?: string }>): void {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => (errors ? { errors } : {}),
  } as Response);
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.ASAAS_API_KEY = 'test-api-key-abc123';
});

afterEach(() => {
  delete process.env.ASAAS_API_KEY;
  vi.restoreAllMocks();
});

// ── createSubscription ─────────────────────────────────────────────────────────

describe('AsaasCloudAdapter.createSubscription', () => {
  it('returns AsaasSubscription with all required fields on success', async () => {
    mockFetchOk({
      id: 'sub_asaas_xyz',
      status: 'ACTIVE',
      nextDueDate: '2026-07-07',
      invoiceUrl: 'https://www.asaas.com/checkout/sub_asaas_xyz',
    });

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.createSubscription('instructor_monthly', 'instructor@test.com');

    expect(result.subscriptionId).toBe('sub_asaas_xyz');
    expect(result.status).toBe('active');
    expect(result.nextDueDate).toBe('2026-07-07');
    expect(result.paymentUrl).toBe('https://www.asaas.com/checkout/sub_asaas_xyz');
  });

  it('returns AsaasSubscription for instructor_annual plan', async () => {
    mockFetchOk({
      id: 'sub_annual_abc',
      status: 'ACTIVE',
      nextDueDate: '2027-06-07',
      invoiceUrl: 'https://www.asaas.com/checkout/sub_annual_abc',
    });

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.createSubscription('instructor_annual', 'instructor@test.com');

    expect(result.subscriptionId).toBe('sub_annual_abc');
    expect(result.status).toBe('active');
  });

  it('sends correct cycle and value for instructor_monthly in the POST body', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'sub_abc', status: 'ACTIVE', nextDueDate: '2026-07-07' }),
    } as Response);

    const adapter = new AsaasCloudAdapter();
    await adapter.createSubscription('instructor_monthly', 'instructor@test.com');

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options!.body as string) as {
      cycle: string;
      value: number;
      customer: string;
    };
    expect(body.cycle).toBe('MONTHLY');
    expect(body.value).toBe(99.00);
    expect(body.customer).toBe('instructor@test.com');
  });

  it('sends correct cycle and value for instructor_annual', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'sub_ann', status: 'ACTIVE', nextDueDate: '2027-06-07' }),
    } as Response);

    const adapter = new AsaasCloudAdapter();
    await adapter.createSubscription('instructor_annual', 'annual@test.com');

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options!.body as string) as { cycle: string; value: number };
    expect(body.cycle).toBe('YEARLY');
    expect(body.value).toBe(990.00);
  });

  it('falls back gracefully when API response lacks id or invoiceUrl', async () => {
    mockFetchOk({
      // id and invoiceUrl omitted — test null-safety
    });

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.createSubscription('instructor_monthly', 'test@test.com');

    expect(result.subscriptionId).toBe('');
    expect(result.paymentUrl).toBe('https://www.asaas.com/checkout/');
    expect(result.status).toBe('active');
    expect(result.nextDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('throws when ASAAS_API_KEY is not configured', async () => {
    delete process.env.ASAAS_API_KEY;

    const adapter = new AsaasCloudAdapter();
    await expect(
      adapter.createSubscription('instructor_monthly', 'test@test.com'),
    ).rejects.toThrow('ASAAS_API_KEY not configured');
  });

  it('throws with Asaas error description when API returns non-ok status', async () => {
    mockFetchError(422, [{ description: 'Customer not found' }]);

    const adapter = new AsaasCloudAdapter();
    await expect(
      adapter.createSubscription('instructor_monthly', 'bad@test.com'),
    ).rejects.toThrow('Customer not found');
  });

  it('throws with asaas_http_<status> when error response has no description', async () => {
    mockFetchError(500);

    const adapter = new AsaasCloudAdapter();
    await expect(
      adapter.createSubscription('instructor_monthly', 'test@test.com'),
    ).rejects.toThrow('asaas_http_500');
  });

  it('never returns fertile/infertile labels in the subscription response', async () => {
    mockFetchOk({
      id: 'sub_check',
      status: 'ACTIVE',
      nextDueDate: '2026-07-07',
      invoiceUrl: 'https://www.asaas.com/checkout/sub_check',
    });

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.createSubscription('instructor_monthly', 'check@test.com');
    const json = JSON.stringify(result).toLowerCase();

    expect(json).not.toContain('fértil');
    expect(json).not.toContain('infértil');
    expect(json).not.toContain('fertile');
    expect(json).not.toContain('seguro');
  });
});

// ── getSubscriptionStatus ──────────────────────────────────────────────────────

describe('AsaasCloudAdapter.getSubscriptionStatus', () => {
  it('returns status active and nextDueDate when Asaas status is ACTIVE', async () => {
    mockFetchOk({ status: 'ACTIVE', nextDueDate: '2026-07-10' });

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.getSubscriptionStatus('sub_123');

    expect(result.status).toBe('active');
    expect(result.nextDueDate).toBe('2026-07-10');
  });

  it('returns status expired when Asaas status is OVERDUE', async () => {
    mockFetchOk({ status: 'OVERDUE', nextDueDate: '2026-06-01' });

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.getSubscriptionStatus('sub_overdue');

    expect(result.status).toBe('expired');
    expect(result.nextDueDate).toBe('2026-06-01');
  });

  it('returns status expired when Asaas status is INACTIVE', async () => {
    mockFetchOk({ status: 'INACTIVE', nextDueDate: '2026-05-01' });

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.getSubscriptionStatus('sub_inactive');

    expect(result.status).toBe('expired');
  });

  it('returns empty string for nextDueDate when API omits the field', async () => {
    mockFetchOk({ status: 'ACTIVE' });

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.getSubscriptionStatus('sub_no_date');

    expect(result.nextDueDate).toBe('');
  });

  it('throws when ASAAS_API_KEY is not configured', async () => {
    delete process.env.ASAAS_API_KEY;

    const adapter = new AsaasCloudAdapter();
    await expect(
      adapter.getSubscriptionStatus('sub_123'),
    ).rejects.toThrow('ASAAS_API_KEY not configured');
  });

  it('throws asaas_http_<status> when API returns non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    const adapter = new AsaasCloudAdapter();
    await expect(
      adapter.getSubscriptionStatus('sub_not_found'),
    ).rejects.toThrow('asaas_http_404');
  });
});

// ── parseWebhookPayload ────────────────────────────────────────────────────────

describe('AsaasCloudAdapter.parseWebhookPayload', () => {
  const secret = 'webhook-secret-test-789';

  it('returns AsaasWebhookResult for a valid PAYMENT_RECEIVED payload', async () => {
    const payload = {
      event: 'PAYMENT_RECEIVED',
      payment: { subscriptionId: 'sub_abc123' },
      customer: { email: 'instructor@test.com' },
    };
    const rawBody = JSON.stringify(payload);
    const signature = hmac(secret, rawBody);

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.parseWebhookPayload(rawBody, signature, secret);

    expect(result.customerId).toBe('instructor@test.com');
    expect(result.event).toBe('PAYMENT_RECEIVED');
    expect(result.subscriptionId).toBe('sub_abc123');
  });

  it('returns AsaasWebhookResult for SUBSCRIPTION_CANCELED event', async () => {
    const payload = {
      event: 'SUBSCRIPTION_CANCELED',
      payment: { subscriptionId: 'sub_xyz' },
      customer: { email: 'cancel@test.com' },
    };
    const rawBody = JSON.stringify(payload);
    const signature = hmac(secret, rawBody);

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.parseWebhookPayload(rawBody, signature, secret);

    expect(result.event).toBe('SUBSCRIPTION_CANCELED');
    expect(result.customerId).toBe('cancel@test.com');
  });

  it('returns AsaasWebhookResult for PAYMENT_OVERDUE event', async () => {
    const payload = {
      event: 'PAYMENT_OVERDUE',
      payment: { subscriptionId: 'sub_overdue' },
      customer: { email: 'overdue@test.com' },
    };
    const rawBody = JSON.stringify(payload);
    const signature = hmac(secret, rawBody);

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.parseWebhookPayload(rawBody, signature, secret);

    expect(result.event).toBe('PAYMENT_OVERDUE');
  });

  it('throws invalid_signature when signature was computed with the wrong secret', async () => {
    const rawBody = JSON.stringify({ event: 'PAYMENT_RECEIVED', customer: { email: 'x@x.com' } });
    const badSignature = hmac('wrong-secret', rawBody);

    const adapter = new AsaasCloudAdapter();
    await expect(
      adapter.parseWebhookPayload(rawBody, badSignature, secret),
    ).rejects.toThrow('invalid_signature');
  });

  it('throws invalid_signature when signature length differs (different hex)', async () => {
    const rawBody = JSON.stringify({ event: 'PAYMENT_RECEIVED' });
    // A short signature has a different length from a valid 64-char HMAC-SHA256 hex
    const shortSig = 'abc123';

    const adapter = new AsaasCloudAdapter();
    await expect(
      adapter.parseWebhookPayload(rawBody, shortSig, secret),
    ).rejects.toThrow('invalid_signature');
  });

  it('uses empty string for customerId and subscriptionId when payload fields are missing', async () => {
    const rawBody = JSON.stringify({ event: 'PAYMENT_RECEIVED' });
    const signature = hmac(secret, rawBody);

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.parseWebhookPayload(rawBody, signature, secret);

    expect(result.customerId).toBe('');
    expect(result.subscriptionId).toBe('');
    // Default event fallback
    expect(result.event).toBe('PAYMENT_RECEIVED');
  });

  it('result never contains fertile/infertile labels (clinical constraint)', async () => {
    const payload = {
      event: 'PAYMENT_RECEIVED',
      payment: { subscriptionId: 'sub_clinical' },
      customer: { email: 'instructor@test.com' },
    };
    const rawBody = JSON.stringify(payload);
    const signature = hmac(secret, rawBody);

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.parseWebhookPayload(rawBody, signature, secret);
    const json = JSON.stringify(result).toLowerCase();

    expect(json).not.toContain('fértil');
    expect(json).not.toContain('fertile');
    expect(json).not.toContain('seguro');
  });
});
