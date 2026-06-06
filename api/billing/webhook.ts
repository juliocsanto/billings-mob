/**
 * POST /api/billing/webhook — ADR-015
 *
 * Recebe eventos de pagamento da Asaas via webhook.
 *
 * Auth: SEM JWT — webhook do Asaas não carrega JWT de usuário.
 * Security: HMAC-SHA256 obrigatório via header 'asaas-signature'.
 *   Usa timingSafeEqual para prevenir timing-oracle attacks (AH-001 pattern).
 *   Fail-closed: se ASAAS_WEBHOOK_SECRET não estiver configurado, retorna 403.
 *
 * Eventos tratados:
 *   PAYMENT_RECEIVED      → subscription_status = 'active'
 *   PAYMENT_OVERDUE       → subscription_status = 'expired'
 *   SUBSCRIPTION_CANCELED → subscription_status = 'expired'
 *
 * Idempotente: sempre retorna 200 { received: true } após processar.
 * Usa createServiceClient() pois não há JWT de usuário disponível.
 *
 * LGPD: customerId contém apenas email da instrutora.
 * Não logar campos clínicos, relations, notes ou dados de cartão.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createServiceClient } from '../_lib/supabaseClient';
import { getBillingAdapter } from '../_lib/billing/billingFactory';

export const runtime = 'nodejs';

const app = new Hono();

app.post('/', async (c) => {
  const secret = process.env.ASAAS_WEBHOOK_SECRET;

  // Fail-closed: secret must be configured
  if (!secret) {
    return c.json({ error: 'invalid_signature' }, 403);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header('asaas-signature') ?? '';

  if (!signature) {
    return c.json({ error: 'invalid_signature' }, 403);
  }

  // Verify HMAC and parse payload via adapter (throws on invalid signature)
  let result;
  try {
    result = await getBillingAdapter().parseWebhookPayload(rawBody, signature, secret);
  } catch {
    return c.json({ error: 'invalid_signature' }, 403);
  }

  // Map event to subscription_status
  const newStatus: 'active' | 'expired' =
    result.event === 'PAYMENT_RECEIVED' ? 'active' : 'expired';

  // Update user_profiles by email match.
  // The Asaas customer email is used to locate the instrutora's profile row.
  // Service role required — no user JWT available for this endpoint.
  const serviceClient = createServiceClient();

  // Resolve email → user_id via direct lookup (O(1), no pagination limit).
  // result.customerId is the Asaas customer email.
  const { data: adminData } = await serviceClient.auth.admin.getUserByEmail(result.customerId);

  if (adminData?.user?.id) {
    const targetUser = adminData.user;
    await serviceClient
      .from('user_profiles')
      .update({ subscription_status: newStatus })
      .eq('id', targetUser.id);
  }
  // If user not found — silently ignore (idempotent, Asaas may resend for old accounts)

  // Idempotent — always 200
  return c.json({ received: true }, 200);
});

export default app;

export const POST = handle(app);
