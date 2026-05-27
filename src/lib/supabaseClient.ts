/**
 * Supabase client for the billings-mob PWA frontend.
 *
 * Uses VITE_ prefixed env vars (exposed to browser by Vite).
 * persistSession: true — session is stored in localStorage by Supabase Auth.
 * autoRefreshToken: true — Supabase SDK handles token refresh automatically.
 * detectSessionInUrl: true — handles the magic link callback (token in URL hash).
 *
 * ADR-005: Supabase Auth with magic link (OTP) as the sole auth mechanism.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || SUPABASE_URL === 'your-project-url-here') {
  console.warn(
    '[billings-mob] VITE_SUPABASE_URL not set. ' +
    'Create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ' +
    'See https://app.supabase.com/project/gcwxwrjzbbqkuzcweyut/settings/api'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
