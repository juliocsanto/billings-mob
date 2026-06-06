/**
 * POST /api/billing/subscribe — ADR-015
 *
 * Inicia uma assinatura Asaas para a instrutora autenticada.
 *
 * Auth: JWT obrigatório (requireAuth middleware) + role = instructor
 * Rate limit: 60 req/60s (apiRateLimit)
 *
 * LGPD: apenas email e plano são enviados à Asaas — nunca dados de cartão.
 * PCI-DSS: escopo reduzido — processamento de cartão ocorre nos servidores Asaas.
 *
 * Flow:
 *   1. Valida JWT (requireAuth)
 *   2. Valida body com Zod (plano)
 *   3. Verifica role = instructor em user_profiles
 *   4. Chama getBillingAdapter().createSubscription()
 *   5. Salva asaas_subscription_id + subscription_status em user_profiles (service role)
 *   6. Retorna 201 { subscriptionId, status, nextDueDate, paymentUrl }
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createServiceClient } from '../_lib/supabaseClient';
import { getBillingAdapter } from '../_lib/billing/billingFactory';

export const runtime = 'nodejs';

const SubscribeBodySchema = z.object({
  plan: z.enum(['instructor_monthly', 'instructor_annual']),
});

const app = new Hono();

app.post('/', apiRateLimit, requireAuth, async (c) => {
  const auth = c.get('auth');

  // Only instructors can subscribe
  if (auth.role !== 'instructor') {
    return c.json({ error: 'Forbidden: only instructors can subscribe' }, 403);
  }

  // Validate request body
  let body: { plan: 'instructor_monthly' | 'instructor_annual' };
  try {
    const raw = await c.req.json();
    body = SubscribeBodySchema.parse(raw);
  } catch {
    return c.json({ error: 'Invalid request body: plan must be instructor_monthly or instructor_annual' }, 400);
  }

  // Retrieve instructor email from JWT user
  // Auth middleware already validated the JWT — re-use the authenticated client
  const { createAuthenticatedClient } = await import('../_lib/supabaseClient');
  const supabase = createAuthenticatedClient(auth.jwt);
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? '';

  if (!email) {
    return c.json({ error: 'Unable to determine user email' }, 400);
  }

  // Call the billing adapter
  let subscription;
  try {
    subscription = await getBillingAdapter().createSubscription(body.plan, email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Billing provider error: ${msg}` }, 502);
  }

  // Persist subscription metadata (service role — bypasses RLS for update)
  const serviceClient = createServiceClient();
  await serviceClient
    .from('user_profiles')
    .update({
      asaas_subscription_id: subscription.subscriptionId,
      subscription_status: 'active',
      subscription_plan: body.plan,
      subscription_expires_at: null, // set on expiry webhook
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

export default app;

export const POST = handle(app);
