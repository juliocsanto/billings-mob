/**
 * GET /api/instructor-student-links/pending
 *
 * Returns all link requests with status = 'pending' for the authenticated instructor.
 * JOINs with user_profiles to include student full_name and email.
 *
 * Auth: JWT required, role must be 'instructor'.
 * Rate limit: 60 req/60s (consistent with other API endpoints — SEC-001).
 * RLS: createAuthenticatedClient enforces row-level security.
 * Defense-in-depth: explicit .eq('instructor_id') + .eq('status','pending') in addition to RLS.
 *
 * LGPD: only name and email of the instructor's own students are returned.
 * Clinical constraint: no clinical data (stamps, cycles, observations) in this response.
 *
 * Response shape:
 * {
 *   links: Array<{
 *     id: string;
 *     student_id: string;
 *     student_name: string;
 *     student_email: string;
 *     status: 'pending';
 *     invited_at: string;
 *   }>
 * }
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../_lib/auth';
import { apiRateLimit } from '../_lib/rateLimit';
import { createAuthenticatedClient } from '../_lib/supabaseClient';
import { forbidden, internalError } from '../_lib/errorHandler';

// ─── Response schema (Zod for shape validation) ───────────────────────────────
const PendingLinkItemSchema = z.object({
  id: z.string().uuid(),
  student_id: z.string().uuid(),
  student_name: z.string(),
  student_email: z.string().email(),
  status: z.literal('pending'),
  invited_at: z.string(),
});

export const PendingLinksResponseSchema = z.object({
  links: z.array(PendingLinkItemSchema),
});

export type PendingLinkItem = z.infer<typeof PendingLinkItemSchema>;

// ─── Raw DB row shape from the JOIN ──────────────────────────────────────────
interface RawLinkRow {
  id: string;
  student_id: string;
  instructor_id: string;
  status: string;
  invited_at: string;
  user_profiles: {
    full_name: string | null;
    email: string;
  } | null;
}

const app = new Hono();

// Rate limiting (SEC-001) + auth
app.use('*', apiRateLimit);
app.use('*', requireAuth);

// ─── GET /api/instructor-student-links/pending ────────────────────────────────
app.get('/', async (c) => {
  const auth = c.get('auth');

  // Role check: only instructors may call this endpoint
  if (auth.role !== 'instructor') {
    return forbidden(c, 'Only instructors can view pending link requests');
  }

  const supabase = createAuthenticatedClient(auth.jwt);

  // JOIN with user_profiles — explicit column list (never SELECT *)
  const { data, error } = await supabase
    .from('instructor_student_links')
    .select('id, student_id, instructor_id, status, invited_at, user_profiles(full_name, email)')
    .eq('instructor_id', auth.userId)   // defense-in-depth (RLS also enforces this)
    .eq('status', 'pending')
    .order('invited_at', { ascending: false });

  if (error) return internalError(c, error);

  const rows = (data ?? []) as RawLinkRow[];

  const links: PendingLinkItem[] = rows.map((row) => ({
    id: row.id,
    student_id: row.student_id,
    student_name: row.user_profiles?.full_name ?? '',
    student_email: row.user_profiles?.email ?? '',
    status: 'pending' as const,
    invited_at: row.invited_at,
  }));

  return c.json({ links });
});

export default app;

import { handle } from 'hono/vercel';
export const GET = handle(app);
