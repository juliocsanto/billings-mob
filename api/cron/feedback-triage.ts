/**
 * GET /api/cron/feedback-triage — Cron worker para pipeline de triage de feedback
 *
 * Vercel Serverless Function (Node.js runtime).
 * ADR-018: Sistema de Feedback Comunitário com Pipeline de Triage por IA.
 *
 * Executado a cada hora via Vercel Cron (0 * * * *).
 * Protegido por CRON_SECRET — requests sem o header correto retornam 401 (fail-closed).
 *
 * Lógica:
 *   1. Valida header Authorization: Bearer <CRON_SECRET>
 *   2. Busca todos os app_feedback com status = 'pending_triage'
 *   3. Para cada um, invoca a edge function feedback-triage via POST
 *   4. Retorna { processed: number, errors: string[] }
 *
 * Segurança:
 *   - CRON_SECRET é um segredo server-side — nunca exposto ao frontend
 *   - service role key da Supabase é usada para autenticar a edge function
 *   - Nunca acessa dados clínicos (observations, cycles, relations, notes)
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createServiceClient } from '../_lib/supabaseClient';

const app = new Hono();

app.get('/', async (c) => {
  // ── 1. Validate CRON_SECRET ────────────────────────────────────────────────
  const cronSecret = process.env['CRON_SECRET'];
  if (!cronSecret) {
    console.error('[cron/feedback-triage] CRON_SECRET not configured — rejecting all requests');
    return c.json({ error: 'service_unavailable' }, 503);
  }

  const authHeader = c.req.header('Authorization');
  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Vercel also sends the token via x-vercel-cron-secret header for scheduled jobs
  const vercelCronHeader = c.req.header('x-vercel-cron-secret');

  if (provided !== cronSecret && vercelCronHeader !== cronSecret) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  // ── 2. Fetch pending_triage feedback ───────────────────────────────────────
  const serviceClient = createServiceClient();

  const { data: pendingItems, error: fetchError } = await serviceClient
    .from('app_feedback')
    .select('id')
    .eq('status', 'pending_triage')
    .order('created_at', { ascending: true })
    .limit(50); // Process at most 50 per run to stay within Vercel function timeout

  if (fetchError) {
    console.error('[cron/feedback-triage] fetch error:', fetchError.message);
    return c.json({ error: 'fetch_failed', message: fetchError.message }, 500);
  }

  if (!pendingItems || pendingItems.length === 0) {
    return c.json({ processed: 0, errors: [], message: 'No pending feedback' });
  }

  // ── 3. Invoke feedback-triage edge function for each item ──────────────────
  const supabaseUrl = process.env['SUPABASE_URL'] ?? '';
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[cron/feedback-triage] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return c.json({ error: 'configuration_error' }, 500);
  }

  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/feedback-triage`;

  let processed = 0;
  const errors: string[] = [];

  for (const item of pendingItems as Array<{ id: string }>) {
    try {
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feedbackId: item.id }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => `http_${response.status}`);
        errors.push(`${item.id}: ${errorText}`);
        console.warn(`[cron/feedback-triage] edge function failed for ${item.id}:`, errorText);
      } else {
        processed++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${item.id}: ${message}`);
      console.warn(`[cron/feedback-triage] fetch error for ${item.id}:`, message);
    }
  }

  console.warn(`[cron/feedback-triage] completed: processed=${processed}, errors=${errors.length}`);

  return c.json({
    processed,
    errors,
    total: pendingItems.length,
  });
});

export default app;

export const GET = handle(app);
