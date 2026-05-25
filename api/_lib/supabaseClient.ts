/**
 * Supabase client factory for Hono.js serverless functions.
 *
 * Two clients:
 *   1. createServiceClient()  — uses SERVICE_ROLE_KEY, bypasses RLS.
 *      Only for trusted server-side operations (e.g. writing audit_log).
 *
 *   2. createAuthenticatedClient(jwt) — uses ANON_KEY + user JWT.
 *      RLS policies are enforced. All user-facing endpoints use this.
 *
 * ADR-003: RLS is the primary access control layer.
 * ADR-005: Supabase Auth JWT carries user id and role claims.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable');
}
if (!SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}

/**
 * Creates a Supabase client authenticated as the requesting user.
 * Passes the user's JWT so that RLS policies are enforced server-side.
 *
 * @param jwt - The Bearer token from the Authorization header.
 */
export function createAuthenticatedClient(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
    auth: {
      // Prevent the client from managing its own session — we're in a serverless context
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Creates a service-role client that bypasses RLS.
 * Use ONLY for:
 *   - Writing to audit_log (no user SELECT policy exists)
 *   - Administrative operations not accessible via RLS
 *
 * NEVER use this client for user-facing read/write operations.
 */
export function createServiceClient(): SupabaseClient {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY — service operations unavailable');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
