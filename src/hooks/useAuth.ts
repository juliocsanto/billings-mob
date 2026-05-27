/**
 * useAuth — React hook for Supabase Auth session management.
 *
 * Exposes:
 *   - user: Supabase User | null
 *   - session: Supabase Session | null
 *   - loading: boolean (true while resolving initial session)
 *   - signInWithMagicLink(email): sends OTP magic link via Supabase Auth
 *   - signOut(): signs out and clears the Supabase session
 *
 * On session change, if the user had anonymous data in localStorage
 * (key: 'billings-mob-v1'), it is migrated to the user-scoped key
 * (key: 'billings-mob-v1-{userId}') if no user-scoped data exists yet.
 *
 * ADR-005: Magic link is the sole auth mechanism — no password, no OAuth.
 * LGPD: 'relations' field is NEVER logged here.
 */
import { useState, useEffect } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

const ANON_STORAGE_KEY = 'billings-mob-v1';

function migrateAnonDataToUser(userId: string): void {
  const userKey = `${ANON_STORAGE_KEY}-${userId}`;
  const alreadyHasUserData = localStorage.getItem(userKey) !== null;
  if (alreadyHasUserData) return;

  const anonRaw = localStorage.getItem(ANON_STORAGE_KEY);
  if (!anonRaw) return;

  try {
    const anonData = JSON.parse(anonRaw);
    // Migrate anonymous data to user-scoped key
    localStorage.setItem(userKey, JSON.stringify(anonData));
    // Do NOT delete anonymous data — keep as fallback
  } catch {
    // Invalid JSON in anonymous storage — skip migration silently
  }
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Resolve initial session (handles magic link callback in URL)
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        migrateAnonDataToUser(s.user.id);
      }
      setLoading(false);
    });

    // Subscribe to auth state changes (sign in, sign out, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        migrateAnonDataToUser(s.user.id);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = async (email: string): Promise<{ error: Error | null }> => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    return { error: error as Error | null };
  };

  const signOut = async (): Promise<void> => {
    // Signs out from Supabase — localStorage cycle data is intentionally preserved
    await supabase.auth.signOut();
  };

  return { user, session, loading, signInWithMagicLink, signOut };
}
