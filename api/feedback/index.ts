/**
 * GET /api/feedback  — lista posts de feedback (paginado)
 * POST /api/feedback — cria novo post de feedback
 *
 * Vercel Serverless Function (Node.js runtime, Hono.js handler).
 * ADR-018: Sistema de Feedback Comunitário com Pipeline de Triage por IA
 * ADR-005: Requer Supabase JWT no header Authorization
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
