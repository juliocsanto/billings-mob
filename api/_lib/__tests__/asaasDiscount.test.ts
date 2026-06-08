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

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
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

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;

    // reason must NOT be in the Asaas request (it's local audit trail only)
    expect(JSON.stringify(body)).not.toContain('reason');
    expect(JSON.stringify(body)).not.toContain('feedback_approved');

    fetchMock.mockRestore();
  });
});
