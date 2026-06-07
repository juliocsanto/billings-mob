/**
 * GET /api/users/me      — perfil do usuário autenticado
 * GET /api/users/search  — busca instrutoras por email
 *
 * Consolidado em um único arquivo para respeitar o limite de 12 Serverless
 * Functions do plano Hobby da Vercel (ADR-015 / Sprint 8 deploy fix).
 *
 * Contratos:
 *   GET /api/users/me
 *     → 200: { data: { id, role, full_name, phone, cenplafam_id, created_at, updated_at } }
 *     → 401: sem autenticação
 *     → 404: perfil não encontrado
 *
 *   GET /api/users/search?role=instructor&email=<email>
 *     → 200: { data: { id, display_name, role } }
 *     → 400: role inválido ou email ausente/inválido
 *     → 401: sem autenticação
 *     → 404: instrutora não encontrada
 *
 * LGPD constraints (search):
 *   - Resposta NUNCA inclui email, phone, notes, relations, cenplafam_id.
 *   - Apenas campos não-sensíveis: id, display_name (alias de full_name), role.
 *
 * ADR-003: RLS enforced via createAuthenticatedClient(jwt).
 * SEC-001: rate limit via apiRateLimit / authRateLimit.
 * OWASP A03: query params validados com Zod antes de tocar qualquer domínio.
 */
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit, authRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient } from '../_lib/supabaseClient';
import { badRequest, internalError, notFound } from '../_lib/errorHandler';

export const runtime = 'nodejs';

const app = new Hono().basePath('/api/users');

// ─── Query schema (search) ────────────────────────────────────────────────────

const SearchQuerySchema = z.object({
  role: z.enum(['instructor']),
  email: z.string().email(),
});

// ─── GET /api/users/me ────────────────────────────────────────────────────────

app.get('/me', authRateLimit, requireAuth, async (c) => {
  const auth = c.get('auth');
  const supabase = createAuthenticatedClient(auth.jwt);

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('id, role, full_name, phone, cenplafam_id, created_at, updated_at')
    .eq('id', auth.userId)
    .single();

  if (error) return internalError(c, error);
  if (!profile) return notFound(c, 'Profile not found');

  return c.json({ data: profile });
});

// ─── GET /api/users/search ────────────────────────────────────────────────────

app.get('/search', apiRateLimit, requireAuth, async (c) => {
  const auth = c.get('auth');

  const rawQuery = {
    role: c.req.query('role'),
    email: c.req.query('email'),
  };

  const parsed = SearchQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? 'Invalid query parameters';
    return badRequest(c, firstError);
  }

  const { email } = parsed.data;
  const supabase = createAuthenticatedClient(auth.jwt);

  // Search for instructor by email — explicit column list (LGPD: no phone, no relations, no notes)
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, role')
    .eq('email', email.trim().toLowerCase())
    .eq('role', 'instructor')
    .single();

  if (error) {
    const pgError = error as { code?: string };
    if (pgError.code === 'PGRST116') {
      return notFound(c, 'Instructor not found');
    }
    return internalError(c, error);
  }

  if (!profile) {
    return notFound(c, 'Instructor not found');
  }

  // Return minimal profile — no LGPD-sensitive fields
  // full_name aliased to display_name (no personal identifier leak via field name)
  return c.json({
    data: {
      id: profile.id,
      display_name: (profile as { full_name: string }).full_name,
      role: profile.role,
    },
  });
});

export default app;

// Vercel Serverless Function handler
export const GET = handle(app);
export const POST = handle(app);
