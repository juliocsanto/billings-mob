/**
 * GET /api/feedback  — lista posts de feedback (paginado)
 * POST /api/feedback — cria novo post de feedback
 * GET  /api/cron/feedback-triage — Vercel Cron worker (consolidated to stay within 12-function Hobby limit)
 *
 * Note: the cron route is reached via vercel.json rewrite:
 *   /api/cron/feedback-triage → /api/feedback/index
 * This consolidation keeps the function count at 11 (Hobby plan limit: 12).
 *
 * Vercel Serverless Function (Node.js runtime, Hono.js handler).
 * ADR-018: Sistema de Feedback Comunitário com Pipeline de Triage por IA
 * ADR-005: Requer Supabase JWT no header Authorization (feedback routes)
 * ADR-003: RLS da Supabase enforça isolamento de dados
 *
 * LGPD: feedback é dado público do usuário (não clínico).
 * Restrição clínica: termos fértil/infértil/seguro/inseguro são rejeitados pelo schema Zod.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { handle } from 'hono/vercel';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import {
  createAuthenticatedClient,
  createServiceClient,
} from '../_lib/supabaseClient';
import { internalError, badRequest } from '../_lib/errorHandler';
import {
  CreateFeedbackSchema,
  ListFeedbackQuerySchema,
  FEEDBACK_PUBLIC_SELECT_COLUMNS,
} from './schema';

const app = new Hono();

// ─── GET /api/cron/feedback-triage (Vercel Cron — no JWT, uses CRON_SECRET) ──
// This route is mounted before the global requireAuth middleware.

app.get('/cron/feedback-triage', async (c) => {
  const cronSecret = process.env['CRON_SECRET'];
  if (!cronSecret) {
    console.error('[cron/feedback-triage] CRON_SECRET not configured — rejecting all requests');
    return c.json({ error: 'service_unavailable' }, 503);
  }

  const authHeader = c.req.header('Authorization');
  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const vercelCronHeader = c.req.header('x-vercel-cron-secret');

  if (provided !== cronSecret && vercelCronHeader !== cronSecret) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const serviceClient = createServiceClient();

  const { data: pendingItems, error: fetchError } = await serviceClient
    .from('app_feedback')
    .select('id')
    .eq('status', 'pending_triage')
    .order('created_at', { ascending: true })
    .limit(50);

  if (fetchError) {
    console.error('[cron/feedback-triage] fetch error:', fetchError.message);
    return c.json({ error: 'fetch_failed', message: fetchError.message }, 500);
  }

  if (!pendingItems || pendingItems.length === 0) {
    return c.json({ processed: 0, errors: [], message: 'No pending feedback' });
  }

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
    total: (pendingItems as Array<{ id: string }>).length,
  });
});

// ─── Global middleware for feedback routes ─────────────────────────────────────

app.use('*', apiRateLimit);
app.use('*', requireAuth);

// ─── GET /api/feedback ────────────────────────────────────────────────────────

app.get('/', zValidator('query', ListFeedbackQuerySchema), async (c) => {
  const auth = c.get('auth');
  const query = c.req.valid('query');
  const supabase = createAuthenticatedClient(auth.jwt);

  const offset = (query.page - 1) * query.limit;

  // Selects public columns. Admin sees triage_result and approval fields via
  // separate admin-only endpoint — here we return the public subset.
  let dbQuery = supabase
    .from('app_feedback')
    .select(`${FEEDBACK_PUBLIC_SELECT_COLUMNS}, comment_count:app_feedback_comments(count)`, {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + query.limit - 1);

  if (query.category) {
    dbQuery = dbQuery.eq('category', query.category);
  }

  if (query.status) {
    // Non-admin users requesting a filter by status — allow for own posts
    dbQuery = dbQuery.eq('status', query.status);
  }

  const { data, error, count } = await dbQuery;

  if (error) {
    return internalError(c, error);
  }

  return c.json({
    items: data ?? [],
    total: count ?? 0,
    page: query.page,
    limit: query.limit,
  });
});

// ─── POST /api/feedback ───────────────────────────────────────────────────────

app.post('/', zValidator('json', CreateFeedbackSchema), async (c) => {
  const auth = c.get('auth');
  const body = c.req.valid('json');
  const serviceClient = createServiceClient();

  // Resolve author_role from user_profiles (server-side, RLS-protected)
  const { data: profile, error: profileError } = await serviceClient
    .from('user_profiles')
    .select('role')
    .eq('id', auth.userId)
    .single();

  if (profileError || !profile) {
    return badRequest(c, 'Perfil de usuário não encontrado');
  }

  const authorRole = (profile as { role: string }).role as 'student' | 'instructor';

  // admin role is not a valid author_role for feedback
  if (authorRole !== 'student' && authorRole !== 'instructor') {
    return badRequest(c, 'Role inválida para publicação de feedback');
  }

  // Insert via service client — RLS INSERT policy uses auth.uid() on the JWT,
  // but we need service role to set author_id correctly.
  // We verify auth.userId is the author — this is an application-layer check.
  const feedbackData = {
    author_id: auth.userId,
    author_role: authorRole,
    category: body.category,
    title: body.title,
    content: body.content,
    status: 'pending_triage' as const,
  };

  const { data, error } = await serviceClient
    .from('app_feedback')
    .insert(feedbackData)
    .select('id, status')
    .single();

  if (error) {
    return internalError(c, error);
  }

  if (!data) {
    return internalError(c, new Error('Insert succeeded but no data returned'));
  }

  return c.json(
    { id: (data as { id: string }).id, status: (data as { status: string }).status },
    201,
  );
});

export default app;

export const GET = handle(app);
export const POST = handle(app);
