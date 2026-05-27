/**
 * GET /api/observations/:id/versions — list version history for a single observation.
 *
 * ADR-003: RLS policy "student_own_versions" lets the student see their own versions.
 *          RLS policy "instructor_sees_student_versions" lets the linked instructor see them.
 *          Both policies are enforced by createAuthenticatedClient(jwt) — no service role here.
 *
 * ADR-004: Every PATCH to /api/observations/:id writes a new row in observation_versions.
 *          This endpoint exposes those rows to the PWA for display in DayDetailModal.
 *
 * LGPD (Art. 11): observation_versions.data contains ONLY { stamp, mucus, bleeding }.
 *   'relations' and 'notes' are NEVER stored in this table.
 *   This is enforced at the DB insert site (api/observations/[id].ts) via sanitizeForAuditLog.
 *   We do NOT select or log 'relations' or 'notes' here either.
 *
 * Clinical constraint (§ 3.3 ARCHITECTURE.md — inviolable):
 *   This endpoint NEVER classifies a day as fertile, infertile, safe, or unsafe.
 *   It only returns raw stamp/mucus/bleeding values that were recorded.
 *
 * Explicit column selection — never SELECT * on tables with sensitive fields.
 */
import { Hono } from 'hono';
import { requireAuth } from '../../_lib/auth';
import { apiRateLimit } from '../../_lib/rateLimit';
import { createAuthenticatedClient } from '../../_lib/supabaseClient';
import { internalError } from '../../_lib/errorHandler';

const app = new Hono();

// Rate limiting before auth (SEC-001)
app.use('*', apiRateLimit);
// All routes require a valid JWT
app.use('*', requireAuth);

// ─── GET /api/observations/:id/versions ────────────────────────────────────────
app.get('/:id/versions', async (c) => {
  const auth = c.get('auth');
  const { id } = c.req.param();
  const supabase = createAuthenticatedClient(auth.jwt);

  // Explicit column list — NEVER SELECT * on tables with potentially sensitive fields.
  // observation_versions.data already excludes relations/notes at write time (ADR-004).
  const { data, error } = await supabase
    .from('observation_versions')
    .select(`
      id,
      observation_id,
      vector_clock,
      data,
      author_id,
      conflict_resolved,
      created_at
    `)
    .eq('observation_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return internalError(c, error);
  }

  const versions = data ?? [];

  return c.json({ data: versions, count: versions.length });
});

export default app;

// Vercel Serverless Function handler
import { handle } from 'hono/vercel';
export const GET = handle(app);
