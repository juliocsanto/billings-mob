/**
 * DayDetailModal — modal exibido ao clicar em um dia no gráfico.
 *
 * Funcionalidades:
 *  - Exibe os dados de observação do dia selecionado (stamp, muco, sangramento, notas)
 *  - Permite editar observações de dias passados (não apenas o dia atual)
 *  - Salva alterações via onSave(date, formData)
 *  - Fecha via onClose() ou clicando fora do modal
 *  - Exibe histórico de versões (Sprint 2 item #11): seção colapsável com edições anteriores
 *
 * Restrição clínica inviolável: o modal NUNCA interpreta o ciclo como fértil ou infértil.
 * LGPD: 'relations' field é exibido apenas como boolean (sim/não) — nunca em logs.
 *       O histórico de versões NUNCA exibe 'relations' ou 'notes' — esses campos
 *       não estão em observation_versions.data (excluídos no servidor por LGPD).
 *
 * Props:
 *   day            — objeto { date, n, obs } do dia clicado
 *   onClose        — callback para fechar o modal
 *   onSave         — callback(date, formData) para salvar a edição
 *   today          — string YYYY-MM-DD (para saber se é hoje ou passado)
 *   observationId  — UUID da observação no Supabase (opcional; sem id = sem histórico)
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DS, STAMPS, MUCUS, BLEEDING, SENSACAO, TIPO_OBSERVACAO, EMPTY_FORM } from '../constants.js';
import { useObservationVersions } from '../hooks/useObservationVersions';

const Lbl = ({ children }) => (
  <div style={{
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: DS.textSec, marginBottom: 8,
  }}>
    {children}
  </div>
);

const Pill = ({ label, active, color, onClick }) => (
  <button onClick={onClick} data-active={active ? 'true' : 'false'} style={{
    background: active ? DS.primary : DS.bg,
    border: `1.5px solid ${active ? DS.primary : DS.border}`,
    borderRadius: DS.radiusBtn, padding: '6px 14px', fontSize: 12, fontWeight: 500,
    color: active ? DS.surface : DS.textSec, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.15s',
  }}>
    {label}
  </button>
);

/**
 * Formats an ISO timestamp for display in pt-BR locale.
 * Example: "2026-05-20T14:00:00Z" → "20/05/2026, 14:00"
 */
function formatVersionDate(isoString) {
  try {
    return new Date(isoString).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Returns the stamp label from the STAMPS constant.
 * Never interprets stamps as fertile/infertile — just returns the label as defined.
 * Clinical constraint: STAMPS labels never contain fertility classifications.
 */
function getStampLabel(stampId) {
  return STAMPS.find(s => s.id === stampId)?.label ?? stampId;
}

/**
 * VersionHistorySection — collapsible section showing past edits of an observation.
 *
 * LGPD constraint: renders ONLY stamp, mucus, bleeding from version.data.
 *   'relations' and 'notes' are NEVER stored in observation_versions.data
 *   (enforced at the API write site via sanitizeForAuditLog).
 *   We do not attempt to render, reference, or mention those fields here.
 *
 * Clinical constraint: never displays fertile/infertile interpretation.
 *   Stamp labels come from the STAMPS constant which never contains those terms.
 */
function VersionHistorySection({ versions, loading }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (loading) {
    return (
      <div style={{ marginTop: 20, padding: '10px 0', textAlign: 'center', color: DS.textSec, fontSize: 12 }}>
        {t('dayDetail.loadingHistory')}
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="version-history"
      style={{ marginTop: 20, borderTop: `1px solid ${DS.border}`, paddingTop: 16 }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          width: '100%', background: 'none', border: 'none', padding: '0 0 8px',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: DS.primary }}>
          {t('dayDetail.versionHistory')}
        </div>
        <span style={{ fontSize: 12, color: DS.textSec }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div>
          {versions.map((version) => {
            // LGPD: version.data contains ONLY clinical fields — never relations or notes.
            // 'relations' and 'notes' are intentionally excluded at the DB/API level.
            const { stamp, mucus, bleeding, sensacao, tipo_observacao } = version.data;
            const stampLabel = getStampLabel(stamp);

            return (
              <div
                key={version.id}
                style={{
                  background: DS.bg, border: `1px solid ${DS.border}`,
                  borderRadius: 10, padding: '10px 12px', marginBottom: 8,
                }}
              >
                {/* Timestamp */}
                <div style={{ fontSize: 11, color: DS.textSec, marginBottom: 4 }}>
                  {formatVersionDate(version.created_at)}
                </div>

                {/* Stamp label */}
                <div style={{ fontSize: 13, fontWeight: 600, color: DS.textMain }}>
                  {stampLabel}
                </div>

                {/* Mucus detail — only rendered if present */}
                {mucus && (
                  <div style={{ fontSize: 11, color: DS.textSec, marginTop: 2 }}>
                    Muco: {MUCUS.find(m => m.id === mucus)?.label ?? mucus}
                  </div>
                )}

                {/* Sensação — only rendered if present */}
                {sensacao && (
                  <div style={{ fontSize: 11, color: DS.textSec, marginTop: 2 }}>
                    Sensação: {SENSACAO.find(s => s.id === sensacao)?.label ?? sensacao}
                  </div>
                )}

                {/* Bleeding detail — only rendered if present */}
                {bleeding && (
                  <div style={{ fontSize: 11, color: DS.textSec, marginTop: 2 }}>
                    Sangramento: {bleeding}
                  </div>
                )}

                {/* O que observa — only rendered if present */}
                {tipo_observacao && (
                  <div style={{ fontSize: 11, color: DS.textSec, marginTop: 2 }}>
                    Observação: {TIPO_OBSERVACAO.find(t => t.id === tipo_observacao)?.label ?? tipo_observacao}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DayDetailModal({ day, onClose, onSave, today: todayDate, observationId }) {
  const { t } = useTranslation();
  const isToday = day.date === todayDate;
  const isPast = day.date < todayDate;
  const isFuture = day.date > todayDate;

  const modalRef = useRef(null);

  const initialForm = day.obs
    ? {
        stamp: day.obs.stamp,
        mucus: day.obs.mucus,
        bleeding: day.obs.bleeding,
        sensacao: day.obs.sensacao ?? null,
        tipo_observacao: day.obs.tipo_observacao ?? null,
        notes: day.obs.notes ?? '',
        relations: day.obs.relations ?? false,
        observacao_descricao: day.obs.observacao_descricao ?? null,
      }
    : { ...EMPTY_FORM };

  const [form, setForm] = useState(initialForm);
  const [saved, setSaved] = useState(false);

  // Fix 3 — Focus trap: move focus to first focusable element when modal opens
  useEffect(() => {
    const focusable = modalRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  }, []);

  // Fix 4 + Fix 5 — Tab cycle and Escape key handler
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = modalRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  // The JWT is not directly available in this component — the hook handles the null case
  // gracefully (returns versions=[] without fetching). When the parent passes observationId
  // from a Supabase-backed observation, the PWA's auth context would supply the JWT.
  // For now (Sprint 2): hook receives null JWT → returns empty versions → no history shown
  // for localStorage-only observations (correct: they have no server-side versions).
  // Future: pass session.access_token as a prop when available.
  const { versions, loading: versionsLoading } = useObservationVersions(
    observationId ?? null,
    null // TODO Sprint 3: accept jwt prop from parent when wiring Supabase session
  );

  // Format date for display
  const dateLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  });

  const handleSave = () => {
    if (!form.stamp) return;
    onSave(day.date, form);
    setSaved(true);
    setTimeout(() => onClose(), 800);
  };

  // Click outside to close
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(26,43,74,0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-detail-modal-title"
        onKeyDown={handleKeyDown}
        style={{
          background: DS.surface,
          borderRadius: '24px 24px 0 0',
          width: '100%', maxWidth: 430,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '0 0 32px',
          boxShadow: DS.shadowModal,
        }}>
        {/* Handle bar */}
        <div style={{
          display: 'flex', justifyContent: 'center', padding: '12px 0 0',
        }}>
          <div style={{
            width: 40, height: 4, borderRadius: 2,
            background: DS.border,
          }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '16px 22px 14px',
          borderBottom: `1px solid ${DS.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div
              id="day-detail-modal-title"
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 20, color: DS.textMain, textTransform: 'capitalize',
              }}
            >
              {dateLabel}
            </div>
            <div style={{ fontSize: 12, color: DS.textSec, marginTop: 2 }}>
              {t('dayDetail.cycleDayLabel', { n: day.n })}
              {isToday && <span style={{ color: DS.primary, fontWeight: 700 }}> · {t('dayDetail.today')}</span>}
              {isPast && <span style={{ color: DS.textSec }}> · {t('dayDetail.pastEdit')}</span>}
              {isFuture && <span style={{ color: DS.textSec }}> · {t('dayDetail.futureDay')}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('dayDetail.closeModal')}
            style={{
              background: 'none', border: 'none', fontSize: 20,
              color: DS.textSec, cursor: 'pointer', padding: '0 0 0 12px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Future day: read-only message */}
        {isFuture ? (
          <div style={{ padding: '32px 22px', textAlign: 'center', color: DS.textSec, fontStyle: 'italic', fontSize: 13 }}>
            {t('dayDetail.futureMessage')}
          </div>
        ) : (
          <div style={{ padding: '20px 22px' }}>
            {/* Save success */}
            {saved && (
              <div style={{
                background: '#D1FAE5', border: `1px solid ${DS.success}`,
                borderRadius: DS.radiusCard, padding: '10px 14px', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ color: DS.success }}>✓</span>
                <span style={{ fontSize: 13, color: DS.success }}>{t('dayDetail.savedSuccess')}</span>
              </div>
            )}

            {/* Past-day notice */}
            {isPast && (
              <div style={{
                background: '#FEF3C7', border: `1px solid ${DS.warning}`,
                borderRadius: DS.radiusCard, padding: '10px 14px', marginBottom: 16,
                fontSize: 12, color: DS.textMain, lineHeight: 1.6,
              }}>
                {t('dayDetail.pastWarning')}
              </div>
            )}

            {/* Stamps */}
            <div style={{ marginBottom: 20 }}>
              <Lbl>{t('dayDetail.observation')}</Lbl>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {STAMPS.map(s => {
                  const active = form.stamp === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setForm(p => ({ ...p, stamp: s.id, mucus: null, bleeding: null, sensacao: null, tipo_observacao: null }))}
                      style={{
                        background: active ? DS.primary : DS.bg,
                        border: `1.5px solid ${active ? DS.primary : DS.border}`,
                        borderRadius: DS.radiusCard, padding: '12px 12px',
                        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.2s',
                        boxShadow: active ? DS.shadowCard : 'none',
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: active ? DS.surface : s.bg,
                        border: `1.5px solid ${active ? DS.primary : s.c}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, color: active ? DS.primary : s.c, marginBottom: 8,
                        fontFamily: 'Georgia, serif', fontWeight: 700,
                      }}>
                        {s.sym}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: active ? DS.surface : DS.textMain }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.8)' : DS.textSec, marginTop: 2 }}>{s.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sensação — disponível para todos os stamps */}
            {form.stamp && (
              <div style={{ marginBottom: 18 }}>
                <Lbl>{t('dayDetail.sensation')}</Lbl>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {SENSACAO.map(s => (
                    <Pill key={s.id} label={s.label} active={form.sensacao === s.id} color={DS.secondary}
                      onClick={() => setForm(p => ({ ...p, sensacao: p.sensacao === s.id ? null : s.id }))} />
                  ))}
                </div>
              </div>
            )}

            {/* Bleeding detail */}
            {form.stamp === 'sangramento' && (
              <div style={{ marginBottom: 18 }}>
                <Lbl>{t('dayDetail.intensity')}</Lbl>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {BLEEDING.map(b => (
                    <Pill key={b.id} label={b.label} active={form.bleeding === b.id} color='#A03030'
                      onClick={() => setForm(p => ({ ...p, bleeding: b.id }))} />
                  ))}
                </div>
              </div>
            )}

            {/* O que você observa — apenas sangramento */}
            {form.stamp === 'sangramento' && (
              <div style={{ marginBottom: 18 }}>
                <Lbl>{t('dayDetail.whatYouObserve')}</Lbl>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TIPO_OBSERVACAO.map(t => (
                    <Pill key={t.id} label={t.label} active={form.tipo_observacao === t.id} color='#A03030'
                      onClick={() => setForm(p => ({ ...p, tipo_observacao: p.tipo_observacao === t.id ? null : t.id }))} />
                  ))}
                </div>
              </div>
            )}

            {/* Descreva o que você vê — campo livre, apenas sangramento, NÃO é LGPD-sensível */}
            {form.stamp === 'sangramento' && (
              <div style={{ marginBottom: 18 }}>
                <Lbl>{t('dayDetail.describeWhatYouSee')}</Lbl>
                <textarea
                  data-testid="observacao-descricao"
                  value={form.observacao_descricao ?? ''}
                  onChange={e => setForm(p => ({ ...p, observacao_descricao: e.target.value || null }))}
                  placeholder={t('dayDetail.describeWhatYouSeePlaceholder')}
                  maxLength={500}
                  style={{
                    width: '100%', background: DS.bg,
                    border: `1.5px solid ${DS.border}`, borderRadius: DS.radiusInput,
                    padding: '10px 14px', fontSize: 13, color: DS.textMain,
                    minHeight: 64, boxSizing: 'border-box', outline: 'none', lineHeight: 1.6,
                  }}
                />
              </div>
            )}

            {/* Mucus detail — todos os stamps exceto sangramento */}
            {form.stamp && form.stamp !== 'sangramento' && (
              <div style={{ marginBottom: 18 }}>
                <Lbl>{t('dayDetail.mucusType')}</Lbl>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <Pill
                    label={t('dayDetail.noMucus')}
                    active={form.mucus === null}
                    color={DS.primary}
                    onClick={() => setForm(p => ({ ...p, mucus: null }))}
                  />
                </div>
                {MUCUS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setForm(p => ({ ...p, mucus: p.mucus === m.id ? null : m.id }))}
                    style={{
                      display: 'block', width: '100%',
                      background: form.mucus === m.id ? DS.primary : DS.bg,
                      border: `1.5px solid ${form.mucus === m.id ? DS.primary : DS.border}`,
                      borderRadius: DS.radiusCard, padding: '10px 14px', textAlign: 'left',
                      cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: form.mucus === m.id ? DS.surface : DS.textMain }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: form.mucus === m.id ? 'rgba(255,255,255,0.8)' : DS.textSec, marginTop: 2 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Apex info */}
            {form.stamp === 'apice' && (
              <div style={{
                background: '#FEF3C7', border: `1px solid ${DS.warning}`,
                borderRadius: DS.radiusCard, padding: '12px 14px', marginBottom: 18,
              }}>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, color: DS.warning, marginBottom: 4, fontStyle: 'italic' }}>
                  {t('dayDetail.apiceMarked')}
                </div>
                <div style={{ fontSize: 12, color: DS.textSec, lineHeight: 1.7 }}>
                  {t('dayDetail.apiceDescription')}<br />
                  <span style={{ color: DS.textSec }}>{t('dayDetail.apiceInformInstructor')}</span>
                </div>
              </div>
            )}

            {/* Relations */}
            <div style={{ marginBottom: 18 }}>
              <Lbl>{t('dayDetail.intimateRelations')}</Lbl>
              <button
                onClick={() => setForm(p => ({ ...p, relations: !p.relations }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: form.relations ? '#FEE2E2' : DS.bg,
                  border: `1.5px solid ${form.relations ? DS.error : DS.border}`,
                  borderRadius: DS.radiusCard, padding: '10px 14px',
                  cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                  textAlign: 'left', transition: 'all 0.2s',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  background: form.relations ? DS.error : 'transparent',
                  border: `1.5px solid ${form.relations ? DS.error : DS.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: DS.surface, transition: 'all 0.2s',
                }}>
                  {form.relations ? '♥' : ''}
                </div>
                <span style={{ fontSize: 13, color: form.relations ? DS.error : DS.textMain }}>
                  {form.relations ? t('dayDetail.relationsYes') : t('dayDetail.relationsNo')}
                </span>
              </button>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <Lbl>{t('dayDetail.notesLabel')}</Lbl>
              <textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder={t('dayDetail.notesPlaceholder')}
                style={{
                  width: '100%', background: DS.bg,
                  border: `1.5px solid ${DS.border}`, borderRadius: DS.radiusInput,
                  padding: '10px 14px', fontSize: 13, color: DS.textMain,
                  minHeight: 64, boxSizing: 'border-box', outline: 'none', lineHeight: 1.6,
                }}
              />
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!form.stamp || saved}
              style={{
                width: '100%',
                background: form.stamp && !saved ? DS.primary : DS.border,
                color: form.stamp && !saved ? DS.surface : DS.textSec,
                border: 'none', borderRadius: DS.radiusBtn, padding: '14px 0',
                fontSize: 14, fontWeight: 700, letterSpacing: '0.05em',
                cursor: form.stamp && !saved ? 'pointer' : 'default',
                fontFamily: 'Lato, sans-serif', transition: 'all 0.2s',
                marginBottom: 10,
              }}
            >
              {saved ? t('dayDetail.savedButton') : isPast ? t('dayDetail.saveEditButton') : t('dayDetail.saveButton')}
            </button>
            {/* Cancel button */}
            {!saved && (
              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: `1.5px solid ${DS.border}`,
                  color: DS.textMain,
                  borderRadius: DS.radiusBtn, padding: '14px 0',
                  fontSize: 14, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'Lato, sans-serif', transition: 'all 0.2s',
                }}
              >
                {t('dayDetail.cancelButton')}
              </button>
            )}

            {/* Version history — only for past and today days, and only when versions exist.
                LGPD: VersionHistorySection never renders relations or notes.
                      Those fields are not in observation_versions.data by design. */}
            {(isPast || isToday) && (
              <VersionHistorySection
                versions={versions}
                loading={versionsLoading}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
