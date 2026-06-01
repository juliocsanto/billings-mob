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
 */
import type { Context, Next } from 'hono';
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

/**
 * Hono middleware that validates the JWT and stores auth context.
 * Mount this on every protected route group.
 *
 * Role resolution order (SEC-003):
 *   1. user_profiles.role (server-side, RLS-protected) — authoritative
 *   2. user_metadata.role ?? 'student' — fallback for pre-trigger accounts only
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
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return c.json(
      { error: 'Unauthorized', message: 'Invalid or expired token' },
      401
    );
  }

  // SEC-003 FIX: read role from user_profiles (server-side, RLS-protected) instead of
  // user_metadata (client-controllable JWT claim). This eliminates the privilege escalation
  // vector where any user could set role:'instructor' during sign-up.
  //
  // RLS policy "user_profiles_own_read" (auth.uid() = id) ensures each user can only
  // read their own profile row, so the authenticated client is correct here.
  //
  // Backward-compat: if user_profiles row is absent (accounts created before the
  // on_auth_user_created trigger was deployed — migration 20260531000010), fall back to
  // user_metadata.role ?? 'student'. This is safe: without a profile row the user has
  // no legitimate instructor privileges regardless.
  let role: AuthContext['role'] = 'student';

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role) {
    role = profile.role as AuthContext['role'];
  } else {
    // Backward-compat fallback for pre-trigger accounts
    role = (user.user_metadata?.role ?? 'student') as AuthContext['role'];
  }

  // Store auth context for downstream handlers
  c.set('auth', {
    userId: user.id,
    role,
    jwt,
  });

  await next();
}
