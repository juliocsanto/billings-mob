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

import { useState } from 'react';
import { C, STAMPS, MUCUS, BLEEDING, SENSACAO, TIPO_OBSERVACAO, EMPTY_FORM } from '../constants.js';
import { useObservationVersions } from '../hooks/useObservationVersions';

const Lbl = ({ children }) => (
  <div style={{
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: C.textMuted, marginBottom: 8,
  }}>
    {children}
  </div>
);

const Pill = ({ label, active, color, onClick }) => (
  <button onClick={onClick} data-active={active ? 'true' : 'false'} style={{
    background: active ? `${color}22` : C.card,
    border: `1.5px solid ${active ? color : C.border}`,
    borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 500,
    color: active ? color : C.textSec, cursor: 'pointer', fontFamily: 'inherit',
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
  const [expanded, setExpanded] = useState(true);

  if (loading) {
    return (
      <div style={{ marginTop: 20, padding: '10px 0', textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
        Carregando histórico...
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="version-history"
      style={{ marginTop: 20, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}
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
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textMuted }}>
          Histórico de edições
        </div>
        <span style={{ fontSize: 12, color: C.textMuted }}>
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
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '10px 12px', marginBottom: 8,
                }}
              >
                {/* Timestamp */}
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>
                  {formatVersionDate(version.created_at)}
                </div>

                {/* Stamp label */}
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                  {stampLabel}
                </div>

                {/* Mucus detail — only rendered if present */}
                {mucus && (
                  <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>
                    Muco: {MUCUS.find(m => m.id === mucus)?.label ?? mucus}
                  </div>
                )}

                {/* Sensação — only rendered if present */}
                {sensacao && (
                  <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>
                    Sensação: {SENSACAO.find(s => s.id === sensacao)?.label ?? sensacao}
                  </div>
                )}

                {/* Bleeding detail — only rendered if present */}
                {bleeding && (
                  <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>
                    Sangramento: {bleeding}
                  </div>
                )}

                {/* O que observa — only rendered if present */}
                {tipo_observacao && (
                  <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>
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
  const isToday = day.date === todayDate;
  const isPast = day.date < todayDate;
  const isFuture = day.date > todayDate;

  const initialForm = day.obs
    ? {
        stamp: day.obs.stamp,
        mucus: day.obs.mucus,
        bleeding: day.obs.bleeding,
        sensacao: day.obs.sensacao ?? null,
        tipo_observacao: day.obs.tipo_observacao ?? null,
        notes: day.obs.notes ?? '',
        relations: day.obs.relations ?? false,
      }
    : { ...EMPTY_FORM };

  const [form, setForm] = useState(initialForm);
  const [saved, setSaved] = useState(false);

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
        background: 'rgba(36,20,8,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div style={{
        background: C.bg,
        borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 430,
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '0 0 32px',
        boxShadow: '0 -4px 32px rgba(36,20,8,0.18)',
      }}>
        {/* Handle bar */}
        <div style={{
          display: 'flex', justifyContent: 'center', padding: '12px 0 0',
        }}>
          <div style={{
            width: 40, height: 4, borderRadius: 2,
            background: C.border,
          }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '16px 22px 14px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontSize: 20, color: C.text, textTransform: 'capitalize',
            }}>
              {dateLabel}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              Dia {day.n} do ciclo
              {isToday && <span style={{ color: C.terra, fontWeight: 700 }}> · Hoje</span>}
              {isPast && <span style={{ color: C.textMuted }}> · Edição de registro passado</span>}
              {isFuture && <span style={{ color: C.textMuted }}> · Dia futuro</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 20,
              color: C.textMuted, cursor: 'pointer', padding: '0 0 0 12px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Future day: read-only message */}
        {isFuture ? (
          <div style={{ padding: '32px 22px', textAlign: 'center', color: C.textMuted, fontStyle: 'italic', fontSize: 13 }}>
            Este dia ainda não chegou. Registre suas observações quando chegar.
          </div>
        ) : (
          <div style={{ padding: '20px 22px' }}>
            {/* Save success */}
            {saved && (
              <div style={{
                background: C.sageLight, border: `1px solid ${C.sageBorder}`,
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ color: C.sage }}>✓</span>
                <span style={{ fontSize: 13, color: C.sage }}>Observação salva</span>
              </div>
            )}

            {/* Past-day notice */}
            {isPast && (
              <div style={{
                background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                fontSize: 12, color: C.textSec, lineHeight: 1.6,
              }}>
                Você está editando um registro passado. As alterações substituem o registro original.
              </div>
            )}

            {/* Stamps */}
            <div style={{ marginBottom: 20 }}>
              <Lbl>Observação</Lbl>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {STAMPS.map(s => {
                  const active = form.stamp === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setForm(p => ({ ...p, stamp: s.id, mucus: null, bleeding: null, sensacao: null, tipo_observacao: null }))}
                      style={{
                        background: active ? s.bg : C.card,
                        border: `1.5px solid ${active ? s.c : C.border}`,
                        borderRadius: 12, padding: '12px 12px',
                        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: active ? C.white : s.bg,
                        border: `1.5px solid ${s.c}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 15, color: s.c, marginBottom: 8,
                        fontFamily: 'Georgia, serif', fontWeight: 700,
                      }}>
                        {s.sym}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: active ? s.c : C.text }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{s.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sensação — disponível para todos os stamps */}
            {form.stamp && (
              <div style={{ marginBottom: 18 }}>
                <Lbl>Sensação</Lbl>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {SENSACAO.map(s => (
                    <Pill key={s.id} label={s.label} active={form.sensacao === s.id} color={C.sage}
                      onClick={() => setForm(p => ({ ...p, sensacao: p.sensacao === s.id ? null : s.id }))} />
                  ))}
                </div>
              </div>
            )}

            {/* Bleeding detail */}
            {form.stamp === 'sangramento' && (
              <div style={{ marginBottom: 18 }}>
                <Lbl>Intensidade</Lbl>
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
                <Lbl>O que você observa</Lbl>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TIPO_OBSERVACAO.map(t => (
                    <Pill key={t.id} label={t.label} active={form.tipo_observacao === t.id} color='#A03030'
                      onClick={() => setForm(p => ({ ...p, tipo_observacao: p.tipo_observacao === t.id ? null : t.id }))} />
                  ))}
                </div>
              </div>
            )}

            {/* Mucus detail — todos os stamps exceto sangramento */}
            {form.stamp && form.stamp !== 'sangramento' && (
              <div style={{ marginBottom: 18 }}>
                <Lbl>Tipo de muco</Lbl>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <Pill
                    label="Sem muco"
                    active={form.mucus === null}
                    color={C.sage}
                    onClick={() => setForm(p => ({ ...p, mucus: null }))}
                  />
                </div>
                {MUCUS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setForm(p => ({ ...p, mucus: p.mucus === m.id ? null : m.id }))}
                    style={{
                      display: 'block', width: '100%',
                      background: form.mucus === m.id ? C.amberLight : C.card,
                      border: `1px solid ${form.mucus === m.id ? C.amber : C.border}`,
                      borderRadius: 10, padding: '10px 14px', textAlign: 'left',
                      cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: form.mucus === m.id ? C.amber : C.text }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Apex info */}
            {form.stamp === 'apice' && (
              <div style={{
                background: C.terraLight, border: `1px solid ${C.terraBorder}`,
                borderRadius: 12, padding: '12px 14px', marginBottom: 18,
              }}>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 16, color: C.terra, marginBottom: 4, fontStyle: 'italic' }}>
                  Ápice marcado
                </div>
                <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
                  Último dia de sensação lubrificante ou escorregadia.<br />
                  <span style={{ color: C.textMuted }}>Informe sua instrutora certificada.</span>
                </div>
              </div>
            )}

            {/* Relations */}
            <div style={{ marginBottom: 18 }}>
              <Lbl>Relações íntimas</Lbl>
              <button
                onClick={() => setForm(p => ({ ...p, relations: !p.relations }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: form.relations ? C.roseLight : C.card,
                  border: `1.5px solid ${form.relations ? C.rose : C.border}`,
                  borderRadius: 12, padding: '10px 14px',
                  cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                  textAlign: 'left', transition: 'all 0.2s',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  background: form.relations ? C.rose : 'transparent',
                  border: `1.5px solid ${form.relations ? C.rose : C.borderStrong}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: '#F0E8DC', transition: 'all 0.2s',
                }}>
                  {form.relations ? '♥' : ''}
                </div>
                <span style={{ fontSize: 13, color: form.relations ? C.rose : C.text }}>
                  {form.relations ? 'Sim — houve relações' : 'Não houve relações'}
                </span>
              </button>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <Lbl>Notas para a instrutora</Lbl>
              <textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="O que você observa / observações para a instrutora..."
                style={{
                  width: '100%', background: C.card,
                  border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: '10px 14px', fontSize: 13, color: C.text,
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
                background: form.stamp && !saved ? C.terra : C.border,
                color: form.stamp && !saved ? C.white : C.textMuted,
                border: 'none', borderRadius: 12, padding: '14px',
                fontSize: 14, fontWeight: 700, letterSpacing: '0.05em',
                cursor: form.stamp && !saved ? 'pointer' : 'default',
                fontFamily: 'Lato, sans-serif', transition: 'all 0.2s',
              }}
            >
              {saved ? 'Salvo ✓' : isPast ? 'Salvar edição' : 'Salvar observação'}
            </button>

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
