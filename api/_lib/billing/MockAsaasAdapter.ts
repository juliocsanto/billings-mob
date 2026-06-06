/**
 * Asaas Mock Adapter — ADR-015
 *
 * Used in development and test environments. Makes no real HTTP requests.
 * Returns deterministic mock data for predictable unit/integration testing.
 *
 * NEVER reads production environment variables (ASAAS_API_KEY, etc.).
 * NEVER sends HTTP requests to any external service.
 *
 * Security: parseWebhookPayload verifies HMAC-SHA256 using the same
 * timingSafeEqual mechanism as the WhatsApp webhook (AH-001 pattern).
 *
 * LGPD: this adapter never logs or persists clinical data, relations, or
 * sensitive payment information. Only metadata (subscriptionId, email) is handled.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  AsaasPort,
  AsaasPlan,
  AsaasSubscription,
  AsaasWebhookResult,
} from './AsaasPort';

export class MockAsaasAdapter implements AsaasPort {
  async createSubscription(_plan: AsaasPlan, _email: string): Promise<AsaasSubscription> {
    // Deterministic mock — subscriptionId uses Date.now() for uniqueness in tests
    const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    return {
      subscriptionId: `mock_${Date.now()}`,
      status: 'active',
      nextDueDate,
      paymentUrl: 'https://mock.asaas.com/checkout/test',
    };
  }

  async getSubscriptionStatus(
    _subscriptionId: string,
  ): Promise<Pick<AsaasSubscription, 'status' | 'nextDueDate'>> {
    const nextDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    return { status: 'active', nextDueDate };
  }

  async parseWebhookPayload(
    rawBody: string,
    signature: string,
    secret: string,
  ): Promise<AsaasWebhookResult> {
    // Verify HMAC-SHA256 — same pattern as WhatsApp webhook (AH-001)
    const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
    const receivedHex = signature;

    if (expectedHex.length !== receivedHex.length) {
      throw new Error('invalid_signature');
    }

    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const receivedBuf = Buffer.from(receivedHex, 'hex');

    if (!timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new Error('invalid_signature');
    }

    // Parse the verified body
    const payload = JSON.parse(rawBody) as {
      event?: string;
      payment?: { subscriptionId?: string };
      customer?: { email?: string };
    };

    return {
      customerId: payload.customer?.email ?? '',
      event: (payload.event ?? 'PAYMENT_RECEIVED') as AsaasWebhookResult['event'],
      subscriptionId: payload.payment?.subscriptionId ?? '',
    };
  }
}
