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
import { STAMPS, MUCUS, BLEEDING, SENSACAO, TIPO_OBSERVACAO, EMPTY_FORM } from '../constants.js';
import { useObservationVersions } from '../hooks/useObservationVersions';

const Lbl = ({ children }) => (
  <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-text-sec mb-2">
    {children}
  </div>
);

const Pill = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    data-active={active ? 'true' : 'false'}
    className={[
      'px-[14px] py-[6px] text-xs font-medium rounded-btn border-[1.5px] transition-all duration-150 cursor-pointer font-sans',
      active
        ? 'bg-primary border-primary text-surface dark:text-bg-app'
        : 'bg-bg-app border-border text-text-sec hover:border-primary/40',
    ].join(' ')}
  >
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
      <div className="mt-5 py-[10px] text-center text-text-sec text-xs">
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
      className="mt-5 border-t border-border pt-4"
    >
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex justify-between items-center w-full bg-transparent border-none pb-2 cursor-pointer font-sans"
      >
        <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-primary">
          {t('dayDetail.versionHistory')}
        </div>
        <span className="text-xs text-text-sec">
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
                className="bg-bg-app border border-border rounded-xl p-3 mb-2"
              >
                {/* Timestamp */}
                <div className="text-[11px] text-text-sec mb-1">
                  {formatVersionDate(version.created_at)}
                </div>

                {/* Stamp label */}
                <div className="text-[13px] font-semibold text-text-main">
                  {stampLabel}
                </div>

                {/* Mucus detail — only rendered if present */}
                {mucus && (
                  <div className="text-[11px] text-text-sec mt-0.5">
                    Muco: {MUCUS.find(m => m.id === mucus)?.label ?? mucus}
                  </div>
                )}

                {/* Sensação — only rendered if present */}
                {sensacao && (
                  <div className="text-[11px] text-text-sec mt-0.5">
                    Sensação: {SENSACAO.find(s => s.id === sensacao)?.label ?? sensacao}
                  </div>
                )}

                {/* Bleeding detail — only rendered if present */}
                {bleeding && (
                  <div className="text-[11px] text-text-sec mt-0.5">
                    Sangramento: {bleeding}
                  </div>
                )}

                {/* O que observa — only rendered if present */}
                {tipo_observacao && (
                  <div className="text-[11px] text-text-sec mt-0.5">
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[rgba(26,43,74,0.5)] animate-fade-in motion-reduce:animate-none"
    >
      <div
        ref={modalRef}
        data-testid="day-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-detail-modal-title"
        onKeyDown={handleKeyDown}
        className="bg-surface rounded-t-2xl fixed bottom-0 left-0 right-0 sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:rounded-2xl w-full max-w-[430px] max-h-[90vh] overflow-y-auto pb-8 shadow-modal animate-slide-up motion-reduce:animate-none sm:animate-fade-in"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="px-[22px] pt-4 pb-[14px] border-b border-border flex justify-between items-start">
          <div>
            <div
              id="day-detail-modal-title"
              className="font-display text-[20px] text-text-main capitalize"
            >
              {dateLabel}
            </div>
            <div className="text-[12px] text-text-sec mt-0.5">
              {t('dayDetail.cycleDayLabel', { n: day.n })}
              {isToday && <span className="text-primary font-bold"> · {t('dayDetail.today')}</span>}
              {isPast && <span className="text-text-sec"> · {t('dayDetail.pastEdit')}</span>}
              {isFuture && <span className="text-text-sec"> · {t('dayDetail.futureDay')}</span>}
            </div>
          </div>
          <button
            data-testid="modal-close"
            onClick={onClose}
            aria-label={t('dayDetail.closeModal')}
            className="bg-transparent border-none text-[20px] text-text-sec cursor-pointer pl-3 leading-none"
          >
            ×
          </button>
        </div>

        {/* Future day: read-only message */}
        {isFuture ? (
          <div className="px-[22px] py-8 text-center text-text-sec italic text-[13px]">
            {t('dayDetail.futureMessage')}
          </div>
        ) : (
          <div className="px-[22px] pt-5">
            {/* Save success */}
            {saved && (
              <div className="bg-success-light border border-success rounded-card px-[14px] py-[10px] mb-4 flex items-center gap-2">
                <span className="text-success">✓</span>
                <span className="text-[13px] text-success">{t('dayDetail.savedSuccess')}</span>
              </div>
            )}

            {/* Past-day notice */}
            {isPast && (
              <div className="bg-warning-light border border-warning rounded-card px-[14px] py-[10px] mb-4 text-[12px] text-text-main leading-[1.6]">
                {t('dayDetail.pastWarning')}
              </div>
            )}

            {/* Stamps */}
            <div className="mb-5">
              <Lbl>{t('dayDetail.observation')}</Lbl>
              <div
                data-testid="stamps-grid"
                className="grid grid-cols-2 gap-2"
              >
                {STAMPS.map(s => {
                  const active = form.stamp === s.id;
                  // Clinical notation colors — theme-invariant CSS vars (single-brace exception)
                  const inactiveCircleStyle = { background: s.bg, borderColor: s.border, color: s.c };
                  return (
                    <button
                      key={s.id}
                      onClick={() => setForm(p => ({ ...p, stamp: s.id, mucus: null, bleeding: null, sensacao: null, tipo_observacao: null }))}
                      className={[
                        'rounded-card p-3 text-left cursor-pointer font-sans transition-all duration-200 border-[1.5px]',
                        active
                          ? 'bg-primary border-primary shadow-card'
                          : 'bg-bg-app border-border',
                      ].join(' ')}
                    >
                      {active ? (
                        <div className="w-7 h-7 rounded-full bg-surface border-[1.5px] border-primary flex items-center justify-center text-[15px] text-primary mb-2 font-serif font-bold">
                          {s.sym}
                        </div>
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[15px] mb-2 font-serif font-bold border-[1.5px]"
                          style={inactiveCircleStyle}
                        >
                          {s.sym}
                        </div>
                      )}
                      <div className={`text-[13px] font-bold ${active ? 'text-surface' : 'text-text-main'}`}>
                        {s.label}
                      </div>
                      <div className={`text-[11px] mt-0.5 ${active ? 'text-white/80' : 'text-text-sec'}`}>
                        {s.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sensação — disponível para todos os stamps */}
            {form.stamp && (
              <div className="mb-[18px]">
                <Lbl>{t('dayDetail.sensation')}</Lbl>
                <div className="flex gap-2 flex-wrap">
                  {SENSACAO.map(s => (
                    <Pill key={s.id} label={s.label} active={form.sensacao === s.id}
                      onClick={() => setForm(p => ({ ...p, sensacao: p.sensacao === s.id ? null : s.id }))} />
                  ))}
                </div>
              </div>
            )}

            {/* Bleeding detail */}
            {form.stamp === 'sangramento' && (
              <div className="mb-[18px]">
                <Lbl>{t('dayDetail.intensity')}</Lbl>
                <div className="flex gap-2 flex-wrap">
                  {BLEEDING.map(b => (
                    <Pill key={b.id} label={b.label} active={form.bleeding === b.id}
                      onClick={() => setForm(p => ({ ...p, bleeding: b.id }))} />
                  ))}
                </div>
              </div>
            )}

            {/* O que você observa — apenas sangramento */}
            {form.stamp === 'sangramento' && (
              <div className="mb-[18px]">
                <Lbl>{t('dayDetail.whatYouObserve')}</Lbl>
                <div className="flex gap-2 flex-wrap">
                  {TIPO_OBSERVACAO.map(t => (
                    <Pill key={t.id} label={t.label} active={form.tipo_observacao === t.id}
                      onClick={() => setForm(p => ({ ...p, tipo_observacao: p.tipo_observacao === t.id ? null : t.id }))} />
                  ))}
                </div>
              </div>
            )}

            {/* Descreva o que você vê — campo livre, apenas sangramento, NÃO é LGPD-sensível */}
            {form.stamp === 'sangramento' && (
              <div className="mb-[18px]">
                <Lbl>{t('dayDetail.describeWhatYouSee')}</Lbl>
                <textarea
                  data-testid="observacao-descricao"
                  value={form.observacao_descricao ?? ''}
                  onChange={e => setForm(p => ({ ...p, observacao_descricao: e.target.value || null }))}
                  placeholder={t('dayDetail.describeWhatYouSeePlaceholder')}
                  maxLength={500}
                  className="w-full bg-bg-app border-[1.5px] border-border rounded-card px-[14px] py-[10px] text-[13px] text-text-main min-h-[64px] box-border outline-none leading-[1.6] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary"
                />
              </div>
            )}

            {/* Mucus detail — todos os stamps exceto sangramento */}
            {form.stamp && form.stamp !== 'sangramento' && (
              <div className="mb-[18px]">
                <Lbl>{t('dayDetail.mucusType')}</Lbl>
                <div className="flex gap-2 mb-[10px]">
                  <Pill
                    label={t('dayDetail.noMucus')}
                    active={form.mucus === null}
                    onClick={() => setForm(p => ({ ...p, mucus: null }))}
                  />
                </div>
                {MUCUS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setForm(p => ({ ...p, mucus: p.mucus === m.id ? null : m.id }))}
                    className={[
                      'block w-full rounded-card px-[14px] py-[10px] text-left cursor-pointer font-sans mb-[6px] transition-all duration-150 border-[1.5px]',
                      form.mucus === m.id
                        ? 'bg-primary border-primary'
                        : 'bg-bg-app border-border',
                    ].join(' ')}
                  >
                    <div className={`text-[13px] font-bold ${form.mucus === m.id ? 'text-surface' : 'text-text-main'}`}>
                      {m.label}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${form.mucus === m.id ? 'text-white/80' : 'text-text-sec'}`}>
                      {m.desc}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Apex info */}
            {form.stamp === 'apice' && (
              <div className="bg-warning-light border border-warning rounded-card px-[14px] py-3 mb-[18px]">
                <div className="font-display text-[16px] text-warning mb-1 italic">
                  {t('dayDetail.apiceMarked')}
                </div>
                <div className="text-[12px] text-text-sec leading-[1.7]">
                  {t('dayDetail.apiceDescription')}<br />
                  <span className="text-text-sec">{t('dayDetail.apiceInformInstructor')}</span>
                </div>
              </div>
            )}

            {/* Relations */}
            <div className="mb-[18px]">
              <Lbl>{t('dayDetail.intimateRelations')}</Lbl>
              <button
                onClick={() => setForm(p => ({ ...p, relations: !p.relations }))}
                className={[
                  'flex items-center gap-3 w-full text-left rounded-card px-[14px] py-[10px] cursor-pointer font-sans transition-all duration-200 border-[1.5px]',
                  form.relations
                    ? 'bg-danger-light border-danger'
                    : 'bg-bg-app border-border',
                ].join(' ')}
              >
                <div className={[
                  'w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] text-surface transition-all duration-200 border-[1.5px]',
                  form.relations
                    ? 'bg-danger border-danger'
                    : 'bg-transparent border-border',
                ].join(' ')}>
                  {form.relations ? '♥' : ''}
                </div>
                <span className={`text-[13px] ${form.relations ? 'text-danger' : 'text-text-main'}`}>
                  {t('dayDetail.relationsHad')}
                </span>
              </button>
            </div>

            {/* Notes */}
            <div className="mb-5">
              <Lbl>{t('dayDetail.notesLabel')}</Lbl>
              <textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder={t('dayDetail.notesPlaceholder')}
                className="w-full bg-bg-app border-[1.5px] border-border rounded-card px-[14px] py-[10px] text-[13px] text-text-main min-h-[64px] box-border outline-none leading-[1.6] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary"
              />
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!form.stamp || saved}
              className={[
                'w-full border-none rounded-btn py-[14px] text-[14px] font-bold tracking-[0.05em] font-sans transition-all duration-200 mb-[10px]',
                form.stamp && !saved
                  ? 'bg-primary text-surface cursor-pointer'
                  : 'bg-border text-text-sec cursor-default',
              ].join(' ')}
            >
              {saved ? t('dayDetail.savedButton') : isPast ? t('dayDetail.saveEditButton') : t('dayDetail.saveButton')}
            </button>
            {/* Cancel button */}
            {!saved && (
              <button
                onClick={onClose}
                className="w-full bg-transparent border-[1.5px] border-border text-text-main rounded-btn py-[14px] text-[14px] font-medium cursor-pointer font-sans transition-all duration-200"
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
