/**
 * Unit tests — AsaasPort.applySubscriptionDiscount (ADR-015, ADR-018)
 *
 * TDD Red/Green/Refactor — written before implementation.
 *
 * Tests:
 *  - MockAsaasAdapter.applySubscriptionDiscount: returns deterministic mock
 *  - AsaasCloudAdapter.applySubscriptionDiscount: correct HTTP call
 *
 * LGPD: only subscriptionId and discount percent transit — no payment card data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockAsaasAdapter } from '../billing/MockAsaasAdapter';
import { AsaasCloudAdapter } from '../billing/AsaasCloudAdapter';
import type { AsaasPlan } from '../billing/AsaasPort';

// ─── MockAsaasAdapter ─────────────────────────────────────────────────────────

describe('MockAsaasAdapter.applySubscriptionDiscount', () => {
  it('returns success=true with mock-discount-id', async () => {
    const adapter = new MockAsaasAdapter();

    const result = await adapter.applySubscriptionDiscount(
      'sub_abc123',
      50,
      'feedback_approved: fb-001',
    );

    expect(result.success).toBe(true);
    expect(result.discountId).toBe('mock-discount-id');
  });

  it('never makes HTTP requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = new MockAsaasAdapter();

    await adapter.applySubscriptionDiscount('sub_xyz', 50, 'test');

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─── MockAsaasAdapter.createSubscription ─────────────────────────────────────

describe('MockAsaasAdapter.createSubscription', () => {
  it('returns an active subscription with a mock subscriptionId and paymentUrl', async () => {
    const adapter = new MockAsaasAdapter();

    const result = await adapter.createSubscription('instructor_monthly' as AsaasPlan, 'aluna@teste.com.br');

    expect(result.status).toBe('active');
    expect(result.subscriptionId).toMatch(/^mock_/);
    expect(result.paymentUrl).toContain('mock.asaas.com');
    expect(result.nextDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('never makes HTTP requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = new MockAsaasAdapter();

    await adapter.createSubscription('instructor_annual' as AsaasPlan, 'user@test.com');

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('nextDueDate is a future date (LGPD: no clinical data in subscription)', async () => {
    const adapter = new MockAsaasAdapter();
    const result = await adapter.createSubscription('instructor_monthly' as AsaasPlan, 'test@test.com');

    const dueDate = new Date(result.nextDueDate);
    expect(dueDate.getTime()).toBeGreaterThan(Date.now());
  });
});

// ─── MockAsaasAdapter.getSubscriptionStatus ──────────────────────────────────

describe('MockAsaasAdapter.getSubscriptionStatus', () => {
  it('returns active status with a future nextDueDate', async () => {
    const adapter = new MockAsaasAdapter();

    const result = await adapter.getSubscriptionStatus('sub_abc');

    expect(result.status).toBe('active');
    expect(result.nextDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // nextDueDate must be in the future (30 days ahead)
    const dueDate = new Date(result.nextDueDate);
    expect(dueDate.getTime()).toBeGreaterThan(Date.now());
  });

  it('never makes HTTP requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = new MockAsaasAdapter();

    await adapter.getSubscriptionStatus('sub_xyz');

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─── MockAsaasAdapter.parseWebhookPayload ────────────────────────────────────

describe('MockAsaasAdapter.parseWebhookPayload', () => {
  function signPayload(body: string, secret: string): string {
    // Same HMAC-SHA256 algorithm as MockAsaasAdapter
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    return createHmac('sha256', secret).update(body).digest('hex');
  }

  const WEBHOOK_SECRET = 'test-webhook-secret';

  it('returns parsed result when HMAC signature is valid', async () => {
    const adapter = new MockAsaasAdapter();
    const payload = JSON.stringify({
      event: 'PAYMENT_RECEIVED',
      payment: { subscriptionId: 'sub_001' },
      customer: { email: 'aluna@billings.app' },
    });
    const signature = signPayload(payload, WEBHOOK_SECRET);

    const result = await adapter.parseWebhookPayload(payload, signature, WEBHOOK_SECRET);

    expect(result.event).toBe('PAYMENT_RECEIVED');
    expect(result.subscriptionId).toBe('sub_001');
    expect(result.customerId).toBe('aluna@billings.app');
  });

  it('throws invalid_signature when HMAC does not match', async () => {
    const adapter = new MockAsaasAdapter();
    const payload = JSON.stringify({ event: 'PAYMENT_RECEIVED' });
    const wrongSignature = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    await expect(adapter.parseWebhookPayload(payload, wrongSignature, WEBHOOK_SECRET))
      .rejects.toThrow('invalid_signature');
  });

  it('throws invalid_signature when signature length does not match', async () => {
    const adapter = new MockAsaasAdapter();
    const payload = JSON.stringify({ event: 'PAYMENT_RECEIVED' });
    // Short signature (length mismatch triggers early exit)
    const shortSignature = 'abc123';

    await expect(adapter.parseWebhookPayload(payload, shortSignature, WEBHOOK_SECRET))
      .rejects.toThrow('invalid_signature');
  });

  it('defaults to PAYMENT_RECEIVED when event field is absent', async () => {
    const adapter = new MockAsaasAdapter();
    const payload = JSON.stringify({
      payment: { subscriptionId: 'sub_002' },
      customer: { email: 'user@test.com' },
    });
    const signature = signPayload(payload, WEBHOOK_SECRET);

    const result = await adapter.parseWebhookPayload(payload, signature, WEBHOOK_SECRET);

    expect(result.event).toBe('PAYMENT_RECEIVED');
  });

  it('does not include clinical data in the returned result (LGPD)', async () => {
    const adapter = new MockAsaasAdapter();
    const payload = JSON.stringify({
      event: 'PAYMENT_OVERDUE',
      payment: { subscriptionId: 'sub_003' },
      customer: { email: 'test@test.com' },
    });
    const signature = signPayload(payload, WEBHOOK_SECRET);

    const result = await adapter.parseWebhookPayload(payload, signature, WEBHOOK_SECRET);

    // Result must only contain customerId, event, subscriptionId — no clinical fields
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['customerId', 'event', 'subscriptionId']),
    );
    expect(result).not.toHaveProperty('relations');
    expect(result).not.toHaveProperty('notes');
  });
});

// ─── AsaasCloudAdapter ────────────────────────────────────────────────────────

describe('AsaasCloudAdapter.applySubscriptionDiscount', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns error when ASAAS_API_KEY is not configured', async () => {
    vi.stubEnv('ASAAS_API_KEY', '');
    const adapter = new AsaasCloudAdapter();

    const result = await adapter.applySubscriptionDiscount('sub_001', 50, 'test');

    expect(result.success).toBe(false);
    expect(result.error).toContain('ASAAS_API_KEY');
  });

  it('sends PUT to /subscriptions/:id with correct discount payload', async () => {
    vi.stubEnv('ASAAS_API_KEY', 'test_asaas_key');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'sub_001' }), { status: 200 }),
    );

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.applySubscriptionDiscount(
      'sub_001',
      50,
      'feedback_approved: fb-uuid',
    );

    expect(result.success).toBe(true);
    expect(result.discountId).toBe('sub_001');

    const [url, options] = fetchMock.mock.calls[0] as [string, { method?: string; body?: string; headers?: Record<string, string> }];
    expect(url).toContain('/subscriptions/sub_001');
    expect(options.method).toBe('PUT');

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    const discount = body['discount'] as Record<string, unknown>;
    expect(discount['value']).toBe(50);
    expect(discount['type']).toBe('PERCENTAGE');
    expect(discount['dueDateLimitDays']).toBe(31);

    fetchMock.mockRestore();
  });

  it('returns error when Asaas API returns non-OK status', async () => {
    vi.stubEnv('ASAAS_API_KEY', 'test_key');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Bad Request', { status: 400 }),
    );

    const adapter = new AsaasCloudAdapter();
    const result = await adapter.applySubscriptionDiscount('sub_bad', 50, 'test');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    fetchMock.mockRestore();
  });

  it('does not include reason in the Asaas request body (reason is local audit only)', async () => {
    vi.stubEnv('ASAAS_API_KEY', 'test_key');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'sub_001' }), { status: 200 }),
    );

    const adapter = new AsaasCloudAdapter();
    await adapter.applySubscriptionDiscount('sub_001', 50, 'feedback_approved: secret-id');

    const [, options] = fetchMock.mock.calls[0] as [string, { method?: string; body?: string; headers?: Record<string, string> }];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;

    // reason must NOT be in the Asaas request (it's local audit trail only)
    expect(JSON.stringify(body)).not.toContain('reason');
    expect(JSON.stringify(body)).not.toContain('feedback_approved');

    fetchMock.mockRestore();
  });
});
