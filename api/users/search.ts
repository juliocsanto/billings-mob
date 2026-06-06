/**
 * GET /api/users/search — busca instrutoras por email.
 *
 * S8-04 (CA-003): Remove o acesso direto do frontend ao Supabase.
 * useInstructorLink.ts passa a chamar este endpoint em vez de
 * supabase.from('user_profiles') diretamente.
 *
 * Contrato:
 *   GET /api/users/search?role=instructor&email=<email>
 *   → 200: { data: { id, display_name, role } }
 *   → 400: role inválido ou email ausente/inválido
 *   → 401: sem autenticação
 *   → 404: instrutora não encontrada
 *
 * LGPD constraints:
 *   - Resposta NUNCA inclui email, phone, notes, relations, cenplafam_id.
 *   - Apenas campos não-sensíveis: id, display_name (alias de full_name), role.
 *   - Busca requer autenticação — prevenção de scraping de dados de instrutoras.
 *
 * ADR-003: RLS enforced via createAuthenticatedClient(jwt).
 * SEC-001: rate limit via apiRateLimit.
 * OWASP A03: query params validados com Zod antes de tocar qualquer domínio.
 */
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient } from '../_lib/supabaseClient';
import { badRequest, internalError, notFound } from '../_lib/errorHandler';

const app = new Hono();

// Rate limiting (SEC-001) — before auth to limit unauthenticated probing
app.use('*', apiRateLimit);
// All routes require authentication (student or instructor)
app.use('*', requireAuth);

// ─── Query schema ──────────────────────────────────────────────────────────

const SearchQuerySchema = z.object({
  role: z.enum(['instructor']),
  email: z.string().email(),
});

// ─── GET /api/users/search ─────────────────────────────────────────────────

app.get('/', async (c) => {
  const auth = c.get('auth');

  // Validate query params
  const rawQuery = {
    role: c.req.query('role'),
    email: c.req.query('email'),
  };

  const parsed = SearchQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    const zodError = parsed.error;
    const firstError = zodError.issues[0]?.message ?? 'Invalid query parameters';
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
    // PGRST116 = row not found — treat as 404
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
