import { Hono } from 'hono';
import { requireAuth } from '../_lib/auth';
import { createAuthenticatedClient } from '../_lib/supabaseClient';
import { internalError, notFound } from '../_lib/errorHandler';

const app = new Hono();

app.use('*', requireAuth);

// ─── GET /api/users/me ─────────────────────────────────────────────────────
app.get('/', async (c) => {
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

export default app;

import { handle } from 'hono/vercel';
export const GET = handle(app);
