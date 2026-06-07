/**
 * /api/billing/* — ADR-015 consolidated handler
 *
 * All billing routes in a single Vercel function to stay within the
 * Hobby plan 12-function limit.
 *
 * Routes:
 *   GET  /api/billing/status    — current subscription status (JWT required)
 *   POST /api/billing/subscribe — start Asaas subscription (JWT required, instructor only)
 *   POST /api/billing/webhook   — Asaas payment events (HMAC-SHA256, no JWT)
 *
 * LGPD: apenas email e plano são enviados à Asaas — nunca dados de cartão.
 * PCI-DSS: escopo reduzido — processamento de cartão ocorre nos servidores Asaas.
 * Clinical constraint: nenhum campo clínico (observations, notes, relations) neste módulo.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient, createServiceClient } from '../_lib/supabaseClient';
import { getBillingAdapter } from '../_lib/billing/billingFactory';
import type { AsaasWebhookResult } from '../_lib/billing/AsaasPort';

export const runtime = 'nodejs';

const app = new Hono().basePath('/api/billing');

// ── GET /api/billing/status ────────────────────────────────────────────────────

app.get('/status', apiRateLimit, requireAuth, async (c) => {
  const auth = c.get('auth');
  const supabase = createAuthenticatedClient(auth.jwt);

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('subscription_status, subscription_plan, asaas_subscription_id, subscription_expires_at')
    .eq('id', auth.userId)
    .single();

  if (error || !profile) {
    return c.json({ subscriptionStatus: 'trial', plan: null, subscriptionId: null, expiresAt: null });
  }

  return c.json({
    subscriptionStatus: profile.subscription_status ?? 'trial',
    plan: profile.subscription_plan ?? null,
    subscriptionId: profile.asaas_subscription_id ?? null,
    expiresAt: profile.subscription_expires_at ?? null,
  });
});

// ── POST /api/billing/subscribe ───────────────────────────────────────────────

const SubscribeBodySchema = z.object({
  plan: z.enum(['instructor_monthly', 'instructor_annual']),
});

app.post('/subscribe', apiRateLimit, requireAuth, async (c) => {
  const auth = c.get('auth');

  if (auth.role !== 'instructor') {
    return c.json({ error: 'Forbidden: only instructors can subscribe' }, 403);
  }

  let body: { plan: 'instructor_monthly' | 'instructor_annual' };
  try {
    const raw = await c.req.json();
    body = SubscribeBodySchema.parse(raw);
  } catch {
    return c.json({ error: 'Invalid request body: plan must be instructor_monthly or instructor_annual' }, 400);
  }

  // Retrieve instructor email from the authenticated supabase client
  const supabase = createAuthenticatedClient(auth.jwt);
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? '';

  if (!email) {
    return c.json({ error: 'Unable to determine user email' }, 400);
  }

  let subscription;
  try {
    subscription = await getBillingAdapter().createSubscription(body.plan, email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Billing provider error: ${msg}` }, 502);
  }

  const serviceClient = createServiceClient();
  await serviceClient
    .from('user_profiles')
    .update({
      asaas_subscription_id: subscription.subscriptionId,
      subscription_status: 'active',
      subscription_plan: body.plan,
      subscription_expires_at: null,
    })
    .eq('id', auth.userId);

  return c.json(
    {
      subscriptionId: subscription.subscriptionId,
      status: subscription.status,
      nextDueDate: subscription.nextDueDate,
      paymentUrl: subscription.paymentUrl,
    },
    201,
  );
});

// ── POST /api/billing/webhook ─────────────────────────────────────────────────

app.post('/webhook', async (c) => {
  const secret = process.env.ASAAS_WEBHOOK_SECRET;

  if (!secret) {
    return c.json({ error: 'invalid_signature' }, 403);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header('asaas-signature') ?? '';

  if (!signature) {
    return c.json({ error: 'invalid_signature' }, 403);
  }

  let result: AsaasWebhookResult;
  try {
    result = await getBillingAdapter().parseWebhookPayload(rawBody, signature, secret);
  } catch {
    return c.json({ error: 'invalid_signature' }, 403);
  }

  const newStatus: 'active' | 'expired' =
    result.event === 'PAYMENT_RECEIVED' ? 'active' : 'expired';

  const serviceClient = createServiceClient();

  // Resolve email → user_id via listUsers() scan.
  // getUserByEmail is not available in @supabase/supabase-js v2. At MVP scale
  // (< 1000 instructors) the pagination limit is not a runtime risk. Revisit in Sprint 8.
  interface AuthUser { id: string; email?: string }
  const listUsersResult = await serviceClient.auth.admin.listUsers() as unknown as { data: { users: AuthUser[] } };
  const targetUser = (listUsersResult.data?.users ?? []).find((u: AuthUser) => u.email === result.customerId);

  if (targetUser?.id) {
    await serviceClient
      .from('user_profiles')
      .update({ subscription_status: newStatus })
      .eq('id', targetUser.id);
  }

  return c.json({ received: true }, 200);
});

export default app;

export const GET = handle(app);
export const POST = handle(app);
