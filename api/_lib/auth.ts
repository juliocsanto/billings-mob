/**
 * Auth middleware for Hono.js API routes.
 *
 * Validates that every request carries a valid Supabase JWT in the
 * Authorization: Bearer <token> header.
 *
 * ADR-005: Supabase Auth (JWT) is the authentication layer.
 * ADR-003: RLS enforces authorization — the JWT is forwarded to Supabase.
 *
 * Returns 401 Unauthorized if:
 *   - No Authorization header is present
 *   - Token format is invalid (not "Bearer <token>")
 *   - Token is expired or invalid (Supabase getUser() returns error)
 *
 * SEC-003 FIX (Sprint 5): role is now read from user_profiles (PostgreSQL, RLS-protected)
 * instead of user.user_metadata?.role (JWT claim settable by any user at sign-up).
 * Migration 20260531000010_on_signup_create_profile ensures every new auth.users row
 * gets a user_profiles row with role='student' via a SECURITY DEFINER trigger.
 * Promotion to instructor/admin must be performed by an operator — never via client input.
 * Backward-compat: if user_profiles row is missing (pre-trigger accounts), falls back to
 * user_metadata.role ?? 'student'.
 *
 * CA-005: authentication (JWT verification) and role resolution (user_profiles query)
 * are separated into pure helper functions for clarity and testability.
 */
import type { Context, Next } from 'hono';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createAuthenticatedClient } from './supabaseClient';

export type AuthContext = {
  userId: string;
  role: 'student' | 'instructor' | 'admin';
  jwt: string;
};

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

// ─── CA-005: extracted helpers ─────────────────────────────────────────────

/**
 * Verifies the JWT via Supabase Auth and returns the authenticated user.
 * Responsibility: Infrastructure — token validation only.
 * The supabase client is already initialized with the JWT — no extra parameter needed.
 */
async function authenticateRequest(
  supabase: SupabaseClient,
): Promise<{ user: User | null; error: unknown }> {
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

/**
 * Resolves the user's application role from user_profiles (server-side, RLS-protected).
 * Responsibility: Application — role / authorization context.
 *
 * Falls back to user_metadata.role ?? 'student' for pre-trigger accounts.
 */
async function resolveUserRole(
  userId: string,
  supabase: SupabaseClient,
  userMetadata: Record<string, unknown>,
): Promise<AuthContext['role']> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role) {
    return profile.role as AuthContext['role'];
  }

  // Backward-compat fallback for pre-trigger accounts
  return (userMetadata?.role ?? 'student') as AuthContext['role'];
}

// ─── Middleware ────────────────────────────────────────────────────────────

/**
 * Hono middleware that validates the JWT and stores auth context.
 * Mount this on every protected route group.
 *
 * Role resolution order (SEC-003):
 *   1. user_profiles.role (server-side, RLS-protected) — authoritative
 *   2. user_metadata.role ?? 'student' — fallback for pre-trigger accounts only
 *
 * Public interface: c.get('auth') returns AuthContext (unchanged — CA-005 is internal only).
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      { error: 'Unauthorized', message: 'Missing or invalid Authorization header' },
      401
    );
  }

  const jwt = authHeader.slice(7); // Remove "Bearer "

  const supabase = createAuthenticatedClient(jwt);
  const { user, error } = await authenticateRequest(supabase);

  if (error || !user) {
    return c.json(
      { error: 'Unauthorized', message: 'Invalid or expired token' },
      401
    );
  }

  const role = await resolveUserRole(user.id, supabase, user.user_metadata ?? {});

  // Store auth context for downstream handlers
  c.set('auth', {
    userId: user.id,
    role,
    jwt,
  });

  await next();
}
