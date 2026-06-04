/**
 * LinkInstructorPage — student UI to search and request link with instructor.
 *
 * Sprint 4 S4-05: aluna busca instrutora por e-mail e envia solicitação de vínculo.
 *
 * Clinical constraint: this page contains NO reference to cycles, fertility,
 * infertility, or any clinical interpretation. It is purely a link management UI.
 *
 * LGPD:
 *  - Only the instructor's name is displayed (id stays internal)
 *  - No student data from other users is exposed
 *  - 'relations' field never mentioned here
 *
 * Design language: matches existing App.jsx palette (inline styles, Lato font,
 * Cormorant Garamond headings, same color tokens).
 */
import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { DS } from '../constants.js';
import { useInstructorLink } from '../hooks/useInstructorLink';

// ── Status label config ───────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:  { label: 'Pendente',  color: DS.warning,  bg: DS.warningLight, border: DS.warningBorder },
  active:   { label: 'Ativo',     color: DS.success,   bg: DS.successLight,  border: DS.successBorder },
  revoked:  { label: 'Revogado',  color: DS.error,   bg: DS.errorLight,  border: DS.errorBorder },
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface LinkInstructorPageProps {
  session: Session | null;
  /** Optional callback to navigate back (e.g. from a router) */
  onBack?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function LinkInstructorPage({ session, onBack }: LinkInstructorPageProps) {
  const { loading, error, instructor, links, searchInstructor, requestLink, getMyLinks } =
    useInstructorLink(session);

  const [emailInput, setEmailInput] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  // Load existing links on mount
  useEffect(() => {
    getMyLinks();
    // getMyLinks is stable (useCallback with session dep) — run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    setRequestSent(false);
    searchInstructor(trimmed);
  };

  const handleRequest = async () => {
    if (!instructor) return;
    await requestLink(instructor.id);
    setRequestSent(true);
  };

  return (
    <div
      style={{
        background: DS.bg,
        minHeight: '100vh',
        fontFamily: 'Lato, sans-serif',
        color: DS.textMain,
        maxWidth: 430,
        margin: '0 auto',
        padding: '0 0 80px',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: '20px 22px 16px',
          background: DS.surface,
          borderBottom: `1px solid ${DS.border}`,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Voltar"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: DS.textSec,
                fontSize: 18,
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              ←
            </button>
          )}
          <div>
            <div
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 13,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: DS.textSec,
                marginBottom: 2,
              }}
            >
              Vínculo
            </div>
            <div
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 22,
                color: DS.textMain,
                fontStyle: 'italic',
              }}
            >
              Minha instrutora
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 22px' }}>

        {/* ── Search section ─────────────────────────────────────── */}
        <div
          style={{
            background: DS.surface,
            border: `1px solid ${DS.border}`,
            borderRadius: 14,
            padding: '18px',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: DS.textSec,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Buscar instrutora por e-mail
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              aria-label="E-mail da instrutora"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="email da instrutora"
              onFocus={e => { e.target.style.outline = `2px solid ${DS.primary}`; e.target.style.outlineOffset = '2px'; }}
              onBlur={e => { e.target.style.outline = 'none'; }}
              style={{
                flex: 1,
                background: DS.surface,
                border: `1px solid ${DS.border}`,
                borderRadius: 10,
                padding: '11px 14px',
                fontSize: 13,
                color: DS.textMain,
                fontFamily: 'Lato, sans-serif',
              }}
            />
            <button
              onClick={handleSearch}
              disabled={!emailInput.trim() || loading}
              style={{
                background: emailInput.trim() && !loading ? DS.primary : DS.border,
                color: emailInput.trim() && !loading ? DS.surface : DS.textSec,
                border: 'none',
                borderRadius: 10,
                padding: '11px 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: emailInput.trim() && !loading ? 'pointer' : 'default',
                fontFamily: 'Lato, sans-serif',
                letterSpacing: '0.04em',
                transition: 'all 0.2s',
                flexShrink: 0,
              }}
            >
              Buscar
            </button>
          </div>
        </div>

        {/* ── Loading indicator ──────────────────────────────────── */}
        {loading && (
          <div
            role="status"
            aria-label="Carregando"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '16px 0',
              color: DS.textSec,
              fontSize: 13,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                border: `2px solid ${DS.border}`,
                borderTopColor: DS.primary,
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { .spin { animation: none !important; } }`}</style>
            Buscando...
          </div>
        )}

        {/* ── Error message ──────────────────────────────────────── */}
        {error && !loading && (
          <div
            style={{
              background: DS.errorLight,
              border: `1px solid ${DS.errorBorder}`,
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 16,
              fontSize: 13,
              color: DS.error,
            }}
          >
            {error}
          </div>
        )}

        {/* ── Success banner ─────────────────────────────────────── */}
        {requestSent && !error && !loading && (
          <div
            style={{
              background: DS.successLight,
              border: `1px solid ${DS.successBorder}`,
              borderRadius: 12,
              padding: '12px 14px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: DS.success,
            }}
          >
            <span style={{ fontSize: 16 }}>✓</span>
            Solicitação enviada com sucesso. Aguarde a aprovação da instrutora.
          </div>
        )}

        {/* ── Instructor card ─────────────────────────────────────── */}
        {instructor && !loading && (
          <div
            style={{
              background: DS.surface,
              border: `1px solid ${DS.successBorder}`,
              borderRadius: 14,
              padding: '16px',
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: DS.successLight,
                  border: `1.5px solid ${DS.successBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: DS.success,
                  flexShrink: 0,
                }}
              >
                ○
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: DS.textMain }}>
                  {instructor.full_name}
                </div>
                <div style={{ fontSize: 12, color: DS.textSec, marginTop: 2 }}>
                  Instrutora certificada
                </div>
              </div>
            </div>

            <button
              onClick={handleRequest}
              disabled={loading || requestSent}
              style={{
                width: '100%',
                background: requestSent ? DS.border : DS.success,
                color: requestSent ? DS.textSec : DS.surface,
                border: 'none',
                borderRadius: 12,
                padding: '13px',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: requestSent || loading ? 'default' : 'pointer',
                fontFamily: 'Lato, sans-serif',
                transition: 'all 0.2s',
              }}
            >
              {requestSent ? 'Solicitação enviada' : 'Solicitar vínculo'}
            </button>
          </div>
        )}

        {/* ── Existing links list ─────────────────────────────────── */}
        {links.length > 0 && (
          <div>
            <div
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 18,
                color: DS.textMain,
                marginBottom: 12,
                fontStyle: 'italic',
              }}
            >
              Vínculos existentes
            </div>

            {links.map(link => {
              const statusConfig = STATUS_LABELS[link.status] ?? STATUS_LABELS.revoked;
              return (
                <div
                  key={link.id}
                  style={{
                    background: DS.surface,
                    border: `1px solid ${DS.border}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: DS.textMain }}>
                      {link.instructor_name || 'Instrutora'}
                    </div>
                    <div style={{ fontSize: 11, color: DS.textSec, marginTop: 2 }}>
                      Instrutora
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: statusConfig.color,
                      background: statusConfig.bg,
                      border: `1px solid ${statusConfig.border}`,
                      borderRadius: 4,
                      padding: '3px 10px',
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}
                  >
                    {statusConfig.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Empty state (no links, no search result) ────────────── */}
        {!loading && links.length === 0 && !instructor && !error && (
          <div
            style={{
              textAlign: 'center',
              padding: '28px 0',
              color: DS.textSec,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 10 }}>○</div>
            <div
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 16,
                color: DS.textSec,
                marginBottom: 6,
              }}
            >
              Nenhum vínculo ainda
            </div>
            <div style={{ fontSize: 12, color: DS.textSec, lineHeight: 1.6 }}>
              Busque a instrutora pelo e-mail cadastrado e envie uma solicitação.
            </div>
          </div>
        )}

        {/* ── Disclaimer ──────────────────────────────────────────── */}
        <div
          style={{
            marginTop: 24,
            background: DS.warningLight,
            border: `1px solid ${DS.warningBorder}`,
            borderRadius: 12,
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: 11, color: DS.textSec, lineHeight: 1.7 }}>
            <strong style={{ color: DS.warning }}>Aviso</strong> — A instrutora receberá uma
            notificação e deverá aprovar o vínculo antes de ter acesso aos seus registros.
          </div>
        </div>
      </div>
    </div>
  );
}
