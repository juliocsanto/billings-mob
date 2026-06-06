/**
 * Asaas Cloud API Adapter — ADR-015
 *
 * Production implementation using Asaas REST API v3.
 * https://docs.asaas.com/reference
 *
 * Env vars required:
 *   ASAAS_API_KEY — Bearer token (Asaas API key from dashboard)
 *
 * LGPD: dados de cartão NUNCA transitam por este backend.
 * Apenas metadados (email, plano, subscriptionId) são enviados e recebidos.
 * PCI-DSS: escopo reduzido — o processamento de cartão ocorre nos servidores Asaas.
 *
 * Security: parseWebhookPayload verifica HMAC-SHA256 via timingSafeEqual
 * para prevenir timing-oracle attacks (AH-001 pattern — ADR-015).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  AsaasPort,
  AsaasPlan,
  AsaasSubscription,
  AsaasWebhookResult,
} from './AsaasPort';

const ASAAS_API_BASE = 'https://api.asaas.com/v3';

/** Valores em reais por plano — alinhado com o pricing do produto (ADR-015). */
const PLAN_VALUES: Record<AsaasPlan, number> = {
  instructor_monthly: 99.00,
  instructor_annual: 990.00,
};

/** Ciclo de cobrança por plano. */
const PLAN_CYCLES: Record<AsaasPlan, 'MONTHLY' | 'YEARLY'> = {
  instructor_monthly: 'MONTHLY',
  instructor_annual: 'YEARLY',
};

export class AsaasCloudAdapter implements AsaasPort {
  async createSubscription(plan: AsaasPlan, email: string): Promise<AsaasSubscription> {
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) {
      throw new Error('ASAAS_API_KEY not configured');
    }

    // nextDueDate = tomorrow (Asaas requer data futura)
    const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const res = await fetch(`${ASAAS_API_BASE}/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: email,
        billingType: 'PIX',
        cycle: PLAN_CYCLES[plan],
        value: PLAN_VALUES[plan],
        nextDueDate,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({})) as { errors?: Array<{ description?: string }> };
      const errMsg = errData?.errors?.[0]?.description ?? `asaas_http_${res.status}`;
      throw new Error(errMsg);
    }

    const data = await res.json() as {
      id?: string;
      status?: string;
      nextDueDate?: string;
      invoiceUrl?: string;
    };

    return {
      subscriptionId: data.id ?? '',
      status: 'active',
      nextDueDate: data.nextDueDate ?? nextDueDate,
      paymentUrl: data.invoiceUrl ?? `https://www.asaas.com/checkout/${data.id ?? ''}`,
    };
  }

  async getSubscriptionStatus(
    subscriptionId: string,
  ): Promise<Pick<AsaasSubscription, 'status' | 'nextDueDate'>> {
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) {
      throw new Error('ASAAS_API_KEY not configured');
    }

    const res = await fetch(`${ASAAS_API_BASE}/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`asaas_http_${res.status}`);
    }

    const data = await res.json() as {
      status?: string;
      nextDueDate?: string;
    };

    // Map Asaas status → internal status
    let status: AsaasSubscription['status'] = 'active';
    if (data.status === 'OVERDUE' || data.status === 'INACTIVE') {
      status = 'expired';
    }

    return {
      status,
      nextDueDate: data.nextDueDate ?? '',
    };
  }

  async parseWebhookPayload(
    rawBody: string,
    signature: string,
    secret: string,
  ): Promise<AsaasWebhookResult> {
    // Verify HMAC-SHA256 — same timingSafeEqual pattern as WhatsApp webhook (AH-001)
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
