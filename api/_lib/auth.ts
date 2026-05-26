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

  // Store auth context for downstream handlers
  c.set('auth', {
    userId: user.id,
    // SEC-003 AUDIT NOTE: role is read from user_metadata which Supabase Auth allows users
    // to set on sign-up. This is a privilege escalation risk if the sign-up flow is not
    // locked down by a server-side Edge Function.
    //
    // CURRENT MITIGATION (Sprint 2): RLS policies limit the blast radius — a user claiming
    // role=instructor can only see links where they are the instructor_id, and since no
    // legitimate student has been linked to them, they see no data.
    //
    // PLANNED FIX (Sprint 4 — billings-edge): The sign-up Edge Function will use the
    // service_role key to write user_metadata.role authoritatively, and this middleware
    // will be updated to read role from user_profiles table (PostgreSQL, RLS-protected)
    // instead of user_metadata.
    //
    // Acceptable risk until Sprint 4: MEDIUM (mitigated by RLS; no data exfiltration path).
    role: (user.user_metadata?.role ?? 'student') as AuthContext['role'],
    jwt,
  });

  await next();
}
