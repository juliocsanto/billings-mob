/**
 * GET /api/billing/status — ADR-015
 *
 * Retorna o status atual da assinatura da instrutora autenticada.
 *
 * Auth: JWT obrigatório (requireAuth middleware)
 * Rate limit: 60 req/60s (apiRateLimit)
 *
 * Flow:
 *   1. Valida JWT (requireAuth)
 *   2. Lê user_profiles via createAuthenticatedClient (RLS enforced)
 *   3. Retorna { subscriptionStatus, plan, subscriptionId, expiresAt }
 *
 * Se nunca assinou: { subscriptionStatus: 'trial', plan: null, subscriptionId: null, expiresAt: null }
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient } from '../_lib/supabaseClient';

export const runtime = 'nodejs';

const app = new Hono();

app.get('/', apiRateLimit, requireAuth, async (c) => {
  const auth = c.get('auth');

  const supabase = createAuthenticatedClient(auth.jwt);

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('subscription_status, subscription_plan, asaas_subscription_id, subscription_expires_at')
    .eq('id', auth.userId)
    .single();

  if (error || !profile) {
    // Profile missing — return trial defaults
    return c.json({
      subscriptionStatus: 'trial',
      plan: null,
      subscriptionId: null,
      expiresAt: null,
    });
  }

  return c.json({
    subscriptionStatus: profile.subscription_status ?? 'trial',
    plan: profile.subscription_plan ?? null,
    subscriptionId: profile.asaas_subscription_id ?? null,
    expiresAt: profile.subscription_expires_at ?? null,
  });
});

export default app;

export const GET = handle(app);
