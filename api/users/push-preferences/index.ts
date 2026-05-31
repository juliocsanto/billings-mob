/**
 * Push Preferences API — GET/PUT /api/users/push-preferences
 *
 * Manages notification preferences for authenticated students.
 * Stores preferences in the `push_preferences` table (ADR-013).
 *
 * GET: Returns preferences or defaults if row does not exist yet.
 * PUT: Upserts preferences (all fields optional).
 *
 * LGPD (Art. 5 + Art. 11):
 *   - fcm_token is personal data — never logged via console.log.
 *   - Only debug-level structured log used for token operations (not accessible in prod).
 *   - SELECT uses explicit column list (never SELECT *).
 *
 * Clinical constraint:
 *   - No function, method, or variable computes or returns a fertile/infertile classification.
 *
 * Security:
 *   - Rate limit: 30 req/60 s (preference updates are idempotent, lower risk than auth ops).
 *   - JWT required on every request; RLS enforces row-level isolation in Supabase.
 *   - Zod validates all input before any domain logic.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../../_lib/auth';
import { createRateLimiter } from '../../_lib/rateLimit';
import { createAuthenticatedClient } from '../../_lib/supabaseClient';
import { badRequest, internalError } from '../../_lib/errorHandler';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

/**
 * Regex for HH:MM — 24-hour format, zero-padded, valid ranges.
 * Examples of valid values: "00:00", "09:00", "21:30", "23:59"
 * Examples of invalid values: "9:5", "24:00", "12:60"
 */
const TIME_HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const PutPreferencesSchema = z
  .object({
    daily_reminder_enabled: z.boolean().optional(),
    daily_reminder_time: z
      .string()
      .regex(TIME_HHMM_REGEX, 'daily_reminder_time must be in HH:MM format (e.g. "21:00")')
      .optional(),
    apex_alert_enabled: z.boolean().optional(),
    conflict_alert_enabled: z.boolean().optional(),
    whatsapp_enabled: z.boolean().optional(),
    /**
     * fcm_token: Firebase Cloud Messaging device token.
     * LGPD: this is personal data — stored but NEVER logged.
     */
    fcm_token: z.string().nullable().optional(),
  })
  .strict();

// ─── Default preferences ──────────────────────────────────────────────────────

/**
 * Returns the default push preferences for a user who has no row yet.
 * These are the app's "sensible defaults" — daily reminders off, alerts on.
 */
function buildDefaults(userId: string) {
  return {
    user_id: userId,
    daily_reminder_enabled: false,
    daily_reminder_time: '21:00',
    apex_alert_enabled: true,
    conflict_alert_enabled: true,
    whatsapp_enabled: false,
    fcm_token: null,
  };
}

// ─── Columns to SELECT (never SELECT *) ──────────────────────────────────────

/**
 * Explicit column list for push_preferences queries.
 * fcm_token IS included in persistence but must never be in log output.
 */
const PREFS_COLUMNS =
  'user_id, daily_reminder_enabled, daily_reminder_time, apex_alert_enabled, conflict_alert_enabled, whatsapp_enabled, fcm_token';

// ─── Rate limiter — 30 req / 60 s ─────────────────────────────────────────────
const prefsRateLimit = createRateLimiter(30, 60_000, 'push-prefs');

// ─── Hono app ──────────────────────────────────────────────────────────────────

const app = new Hono();

app.use('*', prefsRateLimit);
app.use('*', requireAuth);

// ── GET /api/users/push-preferences ──────────────────────────────────────────

app.get('/', async (c) => {
  const auth = c.get('auth');
  const supabase = createAuthenticatedClient(auth.jwt);

  const { data, error } = await supabase
    .from('push_preferences')
    .select(PREFS_COLUMNS)
    .eq('user_id', auth.userId)
    .single();

  // PGRST116 = no rows found — return defaults instead of 404
  if (error && error.code === 'PGRST116') {
    return c.json({ data: buildDefaults(auth.userId) });
  }

  if (error) {
    return internalError(c, error);
  }

  return c.json({ data });
});

// ── PUT /api/users/push-preferences ──────────────────────────────────────────

app.put('/', async (c) => {
  const auth = c.get('auth');

  // Parse body — may be empty object for no-op upsert
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }

  // Validate input
  const parsed = PutPreferencesSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return badRequest(c, firstIssue?.message ?? 'Invalid request body');
  }

  const payload = parsed.data;

  // Build upsert row: merge user_id into the validated payload
  const row = {
    user_id: auth.userId,
    ...payload,
  };

  const supabase = createAuthenticatedClient(auth.jwt);

  const { data, error } = await supabase
    .from('push_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select(PREFS_COLUMNS)
    .single();

  if (error) {
    return internalError(c, error);
  }

  return c.json({ data });
});

export default app;

import { handle } from 'hono/vercel';
export const GET = handle(app);
export const PUT = handle(app);
