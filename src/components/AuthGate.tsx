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
 */
import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { User, Session } from '@supabase/supabase-js';

const C = {
  bg:          '#DDD3C4',
  surface:     '#D4C9B8',
  card:        '#E4D8C8',
  border:      '#B8A898',
  text:        '#241408',
  textSec:     '#6A5040',
  textMuted:   '#9A8070',
  terra:       '#8C3C28',
  terraLight:  '#E8C8BC',
  terraBorder: '#C49080',
  sage:        '#3E5E48',
  sageLight:   '#C8D8CC',
  sageBorder:  '#7EA48A',
  amber:       '#846010',
  amberLight:  '#E4D4A0',
  amberBorder: '#B89848',
  white:       '#F0E8DC',
};

interface AuthGateProps {
  children: (props: { user: User; session: Session }) => ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { user, session, loading, signInWithMagicLink, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // State 1: resolving initial session
  if (loading) {
    return (
      <div style={{
        background: C.bg,
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Lato, sans-serif',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: `3px solid ${C.border}`,
          borderTopColor: C.terra,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 13, color: C.textMuted }}>Carregando...</div>
      </div>
    );
  }

  // State 3: authenticated — render app
  if (user && session) {
    return (
      <>
        {/* Minimal sign-out affordance — small button fixed to header area */}
        <div style={{
          position: 'fixed',
          top: 8,
          right: 12,
          zIndex: 100,
        }}>
          <button
            onClick={signOut}
            title="Sair da conta"
            style={{
              background: 'transparent',
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 10,
              color: C.textMuted,
              cursor: 'pointer',
              fontFamily: 'Lato, sans-serif',
            }}
          >
            Sair
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
      setError('Erro ao enviar o link. Verifique o e-mail e tente novamente.');
    } else {
      setSent(true);
    }
    setSubmitting(false);
  };

  return (
    <div style={{
      background: C.bg,
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
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 28,
            color: C.text,
            marginBottom: 6,
          }}>
            Billings Grafico
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
            Registro do Metodo de Ovulacao Billings
          </div>
        </div>

        {sent ? (
          /* Success state */
          <div style={{
            background: C.sageLight,
            border: `1px solid ${C.sageBorder}`,
            borderRadius: 16,
            padding: '28px 24px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, marginBottom: 12, color: C.sage }}>✓</div>
            <div style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: 18,
              color: C.sage,
              marginBottom: 8,
            }}>
              Link enviado
            </div>
            <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.7 }}>
              Verifique seu e-mail —{' '}
              <strong style={{ color: C.text }}>{email}</strong>
              <br />
              O link de acesso chega em instantes.
            </div>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              style={{
                marginTop: 20,
                background: 'transparent',
                border: `1px solid ${C.sageBorder}`,
                borderRadius: 10,
                padding: '9px 20px',
                fontSize: 12,
                color: C.sage,
                cursor: 'pointer',
                fontFamily: 'Lato, sans-serif',
              }}
            >
              Usar outro e-mail
            </button>
          </div>
        ) : (
          /* Login form */
          <div style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: '28px 24px',
          }}>
            <div style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: 18,
              color: C.text,
              marginBottom: 6,
            }}>
              Acesse sua conta
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 22, lineHeight: 1.6 }}>
              Vamos enviar um link de acesso para o seu e-mail. Nenhuma senha necessaria.
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  E-mail
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com.br"
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    background: '#DDD3C4',
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    fontSize: 14,
                    color: C.text,
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'Lato, sans-serif',
                  }}
                />
              </div>

              {error && (
                <div style={{
                  background: '#E8C8C8',
                  border: '1px solid #C09090',
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 12,
                  color: '#7A2828',
                  marginBottom: 14,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!email.trim() || submitting}
                style={{
                  width: '100%',
                  background: email.trim() && !submitting ? C.terra : C.border,
                  color: email.trim() && !submitting ? C.white : C.textMuted,
                  border: 'none',
                  borderRadius: 12,
                  padding: '14px',
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  cursor: email.trim() && !submitting ? 'pointer' : 'default',
                  fontFamily: 'Lato, sans-serif',
                  transition: 'all 0.2s',
                }}
              >
                {submitting ? 'Enviando...' : 'Enviar link de acesso'}
              </button>
            </form>

            <div style={{
              marginTop: 20,
              fontSize: 11,
              color: C.textMuted,
              lineHeight: 1.6,
              textAlign: 'center',
              fontStyle: 'italic',
            }}>
              Apenas para quem ja fez consultoria com instrutora credenciada CENPLAFAM/WOOMB.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
