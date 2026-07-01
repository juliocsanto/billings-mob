/**
 * AuthGate — Session wrapper component.
 *
 * States:
 *   1. loading   → spinner (neutral, centered)
 *   2. no session → magic link login screen (+ Google OAuth option)
 *   3. session   → renders children (the main App)
 *
 * The magic link callback URL is: window.location.origin + '/auth/callback'
 * Supabase Auth SDK handles the token in the URL hash automatically via
 * detectSessionInUrl: true in supabaseClient.ts.
 *
 * ADR-005: Magic link as primary auth. Google OAuth added as secondary option
 *   (Sprint 6.10). Requires Google provider enabled in Supabase Dashboard:
 *   Authentication > Providers > Google, with Google Cloud Console credentials.
 * ADR-014: All user-visible strings sourced from i18n (useTranslation).
 *
 * LVL-06: All inline style props replaced with Tailwind utility classes.
 *   Spinner uses Tailwind's built-in animate-spin (motion-reduce:animate-none).
 *   Focus rings use focus-visible: classes — no JS onFocus/onBlur handlers.
 */
import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { LanguageSelector } from './LanguageSelector.jsx';
import type { User, Session } from '@supabase/supabase-js';

interface AuthGateProps {
  children: (props: { user: User; session: Session }) => ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { t, i18n } = useTranslation();
  const { user, session, loading, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Google OAuth sign-in via Supabase.
   *
   * CONFIGURATION REQUIRED: Before this button works, enable the Google provider
   * in the Supabase Dashboard under Authentication > Providers > Google.
   * You must supply a Google OAuth Client ID and Secret from the Google Cloud
   * Console (APIs & Services > Credentials). Without this configuration, clicking
   * the button will return a "provider not enabled" error from Supabase.
   */
  const signInWithGoogle = async () => {
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (oauthError) {
      console.error('Google sign-in error:', oauthError.message);
    }
  };

  const googleLabel = i18n.language === 'en' ? 'Continue with Google' : 'Entrar com Google';
  const privacyLabel = i18n.language === 'en' ? 'Privacy Policy' : 'Política de Privacidade';

  // State 1: resolving initial session
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-app">
        <div
          role="status"
          aria-label={t('auth.loading')}
          className="h-10 w-10 animate-spin motion-reduce:animate-none rounded-full border-[3px] border-border border-t-primary"
        />
        <div className="text-sm text-text-sec">{t('auth.loading')}</div>
      </div>
    );
  }

  // State 3: authenticated — render app
  if (user && session) {
    // Language and sign-out moved into the Perfil tab (Sprint 6 UI refresh) —
    // the floating bar collided with the daily reminder banner at 375px.
    return <>{children({ user, session })}</>;
  }

  // State 2: no session — magic link login
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    const { error: authError } = await signInWithMagicLink(email.trim());
    if (authError) {
      setError(t('auth.errorGeneric'));
    } else {
      setSent(true);
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-app px-[22px] py-6">
      <div className="w-full max-w-[360px]">
        {/* Logo / heading */}
        <div className="mb-9 text-center">
          <div className="mb-1.5 text-2xl font-bold text-primary">
            {t('auth.appName')}
          </div>
          <div className="text-xs leading-relaxed text-text-sec">
            {t('auth.appSubtitle')}
          </div>
          {/* Language selector on login screen */}
          <div className="mt-2.5 flex justify-center">
            <LanguageSelector />
          </div>
        </div>

        {sent ? (
          /* Success state */
          <div className="rounded-2xl border border-border bg-surface px-6 py-7 text-center shadow-card">
            <div className="mb-3 text-[28px] text-success" aria-hidden="true">✓</div>
            <div className="mb-2 text-lg font-bold text-success">
              {t('auth.checkEmail')}
            </div>
            <div className="text-sm leading-[1.7] text-text-sec">
              {t('auth.checkEmailBody', { email })}
            </div>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="mt-5 rounded-btn border border-border bg-transparent px-5 py-[9px] text-xs text-text-main transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {t('auth.useOtherEmail')}
            </button>
          </div>
        ) : (
          /* Login form */
          <div className="rounded-2xl border border-border bg-surface px-6 py-7 shadow-card">
            <div className="mb-1.5 text-lg font-bold text-text-main">
              {t('auth.loginTitle')}
            </div>
            <div className="mb-[22px] text-xs leading-relaxed text-text-sec">
              {t('auth.loginSubtitle')}
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-3.5">
                <label
                  htmlFor="email-login"
                  className="mb-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-text-sec"
                >
                  {t('auth.emailLabel')}
                </label>
                <input
                  id="email-login"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                  autoFocus
                  className="w-full rounded-card border border-border bg-surface px-[14px] py-3 text-sm text-text-main transition-colors placeholder:text-text-sec/60 focus:border-primary focus:ring-2 focus:ring-primary/25 focus-visible:outline-none"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-3.5 rounded-card border border-danger bg-danger-light px-3 py-[9px] text-xs text-danger"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                data-testid="btn-send-magic-link"
                disabled={!email.trim() || submitting}
                className="w-full rounded-btn bg-primary px-4 py-[14px] text-sm font-bold tracking-[0.05em] text-surface transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-border disabled:text-text-sec"
              >
                {submitting ? t('auth.sending') : t('auth.sendMagicLink')}
              </button>
            </form>

            <div className="mt-5 text-center text-[11px] italic leading-relaxed text-text-sec">
              {t('auth.disclaimer')}
            </div>

            {/* ── Separator ─────────────────────────── */}
            <div className="my-[18px] flex items-center gap-2.5">
              <div className="h-px flex-1 bg-border" />
              <span className="whitespace-nowrap text-xs text-text-sec">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* ── Google OAuth button ────────────────── */}
            <button
              type="button"
              onClick={signInWithGoogle}
              aria-label={googleLabel}
              className="flex w-full items-center justify-center gap-2.5 rounded-btn border border-border bg-surface px-[14px] py-3 text-sm font-semibold text-text-main transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {/* Google icon (SVG inline) */}
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 18 18"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                  fill="#4285F4"
                />
                <path
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                  fill="#34A853"
                />
                <path
                  d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                  fill="#FBBC05"
                />
                <path
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                  fill="#EA4335"
                />
              </svg>
              {googleLabel}
            </button>

            {/* ── Privacy Policy link ────────────────── */}
            <a
              href="/privacy"
              className="mt-4 block text-center text-xs text-text-sec transition-colors hover:text-text-main hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded-sm"
            >
              {privacyLabel}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
