/**
 * AuthGate — Session wrapper component.
 *
 * States:
 *   1. loading   → spinner (neutral, centered)
 *   2. no session → magic link login screen
 *   3. session   → renders children (the main App)
 *
 * The magic link callback URL is: window.location.origin + '/auth/callback'
 * Supabase Auth SDK handles the token in the URL hash automatically via
 * detectSessionInUrl: true in supabaseClient.ts.
 *
 * ADR-005: Magic link only — no password form, no OAuth social buttons.
 * ADR-014: All user-visible strings sourced from i18n (useTranslation).
 */
import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { DS } from '../constants.js';
import { LanguageSelector } from './LanguageSelector.jsx';
import type { User, Session } from '@supabase/supabase-js';

interface AuthGateProps {
  children: (props: { user: User; session: Session }) => ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { t } = useTranslation();
  const { user, session, loading, signInWithMagicLink, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // State 1: resolving initial session
  if (loading) {
    return (
      <div style={{
        background: DS.bg,
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Lato, sans-serif',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div
          role="status"
          aria-label={t('auth.loading')}
          style={{
            width: 40,
            height: 40,
            border: `3px solid ${DS.border}`,
            borderTopColor: DS.primary,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { .spin { animation: none !important; } }`}</style>
        <div style={{ fontSize: 13, color: DS.textSec }}>{t('auth.loading')}</div>
      </div>
    );
  }

  // State 3: authenticated — render app
  if (user && session) {
    return (
      <>
        {/* Sign-out affordance + language selector — fixed to header area */}
        <div style={{
          position: 'fixed',
          top: 8,
          right: 12,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <LanguageSelector />
          <button
            onClick={signOut}
            title={t('auth.signOut')}
            style={{
              background: 'transparent',
              border: `1px solid ${DS.border}`,
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 10,
              color: DS.textSec,
              cursor: 'pointer',
              fontFamily: 'Lato, sans-serif',
            }}
          >
            {t('auth.signOut')}
          </button>
        </div>
        {children({ user, session })}
      </>
    );
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
    <div style={{
      background: DS.bg,
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Lato, sans-serif',
      padding: '24px 22px',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Logo / heading */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            fontFamily: 'Lato, sans-serif',
            fontSize: 24,
            fontWeight: 700,
            color: DS.primary,
            marginBottom: 6,
          }}>
            {t('auth.appName')}
          </div>
          <div style={{ fontSize: 12, color: DS.textSec, lineHeight: 1.6 }}>
            {t('auth.appSubtitle')}
          </div>
          {/* Language selector on login screen */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
            <LanguageSelector />
          </div>
        </div>

        {sent ? (
          /* Success state */
          <div style={{
            background: DS.surface,
            border: `1px solid ${DS.border}`,
            borderRadius: 16,
            padding: '28px 24px',
            textAlign: 'center',
            boxShadow: DS.shadowCard,
          }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: DS.success }}>✓</div>
            <div style={{
              fontFamily: 'Lato, sans-serif',
              fontSize: 18,
              fontWeight: 700,
              color: DS.success,
              marginBottom: 8,
            }}>
              {t('auth.checkEmail')}
            </div>
            <div style={{ fontSize: 13, color: DS.textSec, lineHeight: 1.7 }}>
              {t('auth.checkEmailBody', { email })}
            </div>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              style={{
                marginTop: 20,
                background: 'transparent',
                border: `1.5px solid ${DS.border}`,
                borderRadius: DS.radiusBtn,
                padding: '9px 20px',
                fontSize: 12,
                color: DS.textMain,
                cursor: 'pointer',
                fontFamily: 'Lato, sans-serif',
              }}
            >
              {t('auth.useOtherEmail')}
            </button>
          </div>
        ) : (
          /* Login form */
          <div style={{
            background: DS.surface,
            border: `1px solid ${DS.border}`,
            borderRadius: 16,
            padding: '28px 24px',
            boxShadow: DS.shadowCard,
          }}>
            <div style={{
              fontFamily: 'Lato, sans-serif',
              fontSize: 18,
              fontWeight: 700,
              color: DS.textMain,
              marginBottom: 6,
            }}>
              {t('auth.loginTitle')}
            </div>
            <div style={{ fontSize: 12, color: DS.textSec, marginBottom: 22, lineHeight: 1.6 }}>
              {t('auth.loginSubtitle')}
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label
                  htmlFor="email-login"
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 700,
                    color: DS.textSec,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
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
                  onFocus={e => { (e.target as HTMLInputElement).style.outline = `2px solid ${DS.primary}`; (e.target as HTMLInputElement).style.outlineOffset = '2px'; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.outline = 'none'; }}
                  style={{
                    width: '100%',
                    background: DS.surface,
                    border: `1.5px solid ${DS.border}`,
                    borderRadius: DS.radiusInput,
                    padding: '12px 14px',
                    fontSize: 14,
                    color: DS.textMain,
                    boxSizing: 'border-box',
                    fontFamily: 'Lato, sans-serif',
                  }}
                />
              </div>

              {error && (
                <div
                  role="alert"
                  style={{
                    background: '#FEE2E2',
                    border: `1px solid ${DS.error}`,
                    borderRadius: DS.radiusInput,
                    padding: '9px 12px',
                    fontSize: 12,
                    color: DS.error,
                    marginBottom: 14,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!email.trim() || submitting}
                style={{
                  width: '100%',
                  background: email.trim() && !submitting ? DS.primary : DS.border,
                  color: email.trim() && !submitting ? DS.surface : DS.textSec,
                  border: 'none',
                  borderRadius: DS.radiusBtn,
                  padding: '14px',
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  cursor: email.trim() && !submitting ? 'pointer' : 'default',
                  fontFamily: 'Lato, sans-serif',
                  transition: 'all 0.2s',
                }}
              >
                {submitting ? t('auth.sending') : t('auth.sendMagicLink')}
              </button>
            </form>

            <div style={{
              marginTop: 20,
              fontSize: 11,
              color: DS.textSec,
              lineHeight: 1.6,
              textAlign: 'center',
              fontStyle: 'italic',
            }}>
              {t('auth.disclaimer')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
