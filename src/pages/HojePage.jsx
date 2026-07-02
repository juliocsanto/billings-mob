/**
 * HojePage — daily observation form (extracted from App.jsx, Sprint 6 UI refresh).
 *
 * Clinical constraint: stamps are observation categories only — never
 * fertile/infertile/safe/unsafe. LGPD: relations/notes stay on-device until
 * synced through the API, which never logs them.
 */
import { useTranslation } from 'react-i18next';
import { STAMPS, MUCUS, BLEEDING, SENSACAO, EMPTY_FORM } from '../constants.js';
import { today } from '../utils/dates.js';
import { Button } from '../components/ui';

export function HojePage({
  form,
  setForm,
  saved,
  confirmNew,
  setConfirmNew,
  onSave,
  onStartNewCycle,
}) {
  const { t } = useTranslation();

  return (
  <>
    <div className="px-5 pt-6 pb-40">
      <h1 className="sr-only">{t('nav.hoje')}</h1>

      {saved && (
        <div
          role="status"
          className="mb-5 flex items-center gap-2 rounded-card border border-success/30 bg-success-light px-4 py-2.5 animate-fade-in"
        >
          <span aria-hidden="true" className="text-sm text-success">✓</span>
          <span className="text-sm font-semibold text-success">{t('app.savedToday')}</span>
        </div>
      )}

      {/* Stamps */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text-sec">
          {t('app.observacaoHoje')}
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          {STAMPS.map((s) => {
            const active = form.stamp === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setForm((p) => ({ ...p, stamp: s.id, mucus: null, bleeding: null }))}
                aria-pressed={active}
                data-testid={`stamp-${s.id}`}
                className={[
                  'rounded-2xl border-[1.5px] p-4 text-left transition-all',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  active
                    ? 'border-primary bg-primary shadow-card'
                    : 'border-border bg-surface hover:border-primary/40',
                ].join(' ')}
              >
                <div
                  aria-hidden="true"
                  className={`mb-2.5 flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] font-serif text-lg font-bold ${active ? 'bg-surface' : ''}`}
                  style={
                    active
                      ? { borderColor: s.c, color: s.c }
                      : { background: s.bg, borderColor: s.c, color: s.c }
                  }
                >
                  {s.sym}
                </div>
                <div className={`text-sm font-bold ${active ? 'text-surface dark:text-bg-app' : 'text-text-main'}`}>
                  {t('stamps.' + s.id)}
                </div>
                <div className={`mt-0.5 text-xs ${active ? 'text-surface/80 dark:text-bg-app/80' : 'text-text-sec'}`}>
                  {t('stampsub.' + s.id)}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Sensação — LVL-10 */}
      <section className="mb-6" aria-label={t('dayDetail.sensation')}>
        <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text-sec">
          {t('dayDetail.sensation')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {SENSACAO.map((s) => {
            const active = form.sensacao === s.id;
            return (
              <button
                key={s.id}
                aria-pressed={active}
                data-testid={`sensacao-${s.id}`}
                onClick={() => setForm((p) => ({ ...p, sensacao: active ? null : s.id }))}
                className={[
                  'min-h-[40px] rounded-btn border px-4 py-1.5 text-sm font-semibold transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                  active
                    ? 'border-primary bg-primary text-surface dark:text-bg-app'
                    : 'border-border bg-surface text-text-sec hover:border-primary/40',
                ].join(' ')}
              >
                {t('sensacao.' + s.id)}
              </button>
            );
          })}
        </div>
      </section>

      {/* Bleeding detail */}
      {form.stamp === 'sangramento' && (
        <section className="mb-6">
          <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text-sec">
            {t('dayDetail.intensity')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {BLEEDING.map((b) => {
              const active = form.bleeding === b.id;
              return (
                <button
                  key={b.id}
                  aria-pressed={active}
                  onClick={() => setForm((p) => ({ ...p, bleeding: b.id }))}
                  className={[
                    'min-h-[40px] rounded-btn border px-4 py-1.5 text-sm font-semibold transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                    active
                      ? 'border-danger bg-danger-light text-danger'
                      : 'border-border bg-surface text-text-sec hover:border-danger/40',
                  ].join(' ')}
                >
                  {t('bleeding.' + b.id)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Mucus detail — all stamps except sangramento (parity with DayDetailModal) */}
      {form.stamp && form.stamp !== 'sangramento' && (
        <section className="mb-6">
          <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text-sec">
            {t('dayDetail.mucusType')}
          </h2>
          <div className="mb-2.5 flex flex-wrap gap-2">
            <button
              aria-pressed={form.mucus === null}
              data-testid="mucus-none"
              onClick={() => setForm((p) => ({ ...p, mucus: null }))}
              className={[
                'min-h-[40px] rounded-btn border px-4 py-1.5 text-sm font-semibold transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                form.mucus === null
                  ? 'border-primary bg-primary text-surface dark:text-bg-app'
                  : 'border-border bg-surface text-text-sec hover:border-primary/40',
              ].join(' ')}
            >
              {t('dayDetail.noMucus')}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {MUCUS.map((m) => {
              const active = form.mucus === m.id;
              return (
                <button
                  key={m.id}
                  aria-pressed={active}
                  data-testid={`mucus-${m.id}`}
                  onClick={() => setForm((p) => ({ ...p, mucus: active ? null : m.id }))}
                  className={[
                    'w-full rounded-card border px-4 py-3 text-left transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                    active ? 'border-primary bg-primary' : 'border-border bg-surface hover:border-primary/40',
                  ].join(' ')}
                >
                  <div className={`text-sm font-bold ${active ? 'text-surface dark:text-bg-app' : 'text-text-main'}`}>
                    {t('mucus.' + m.id)}
                  </div>
                  <div className={`mt-0.5 text-xs ${active ? 'text-surface/80 dark:text-bg-app/80' : 'text-text-sec'}`}>
                    {t('mucus.' + m.id + '_desc')}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Apex info */}
      {form.stamp === 'apice' && (
        <div className="mb-6 rounded-2xl border border-warning/40 bg-warning-light px-4 py-3.5">
          <p className="mb-1.5 font-display text-lg italic text-warning">{t('dayDetail.apiceMarked')}</p>
          <p className="text-xs leading-relaxed text-text-sec">
            {t('app.apiceDescLine1')}
            <br />
            {t('app.apiceDescLine2')}
            <br />
            {t('app.apiceDescLine3')}
          </p>
        </div>
      )}

      {/* Relations — LGPD sensitive: visible only to the instrutora */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text-sec">
          {t('dayDetail.intimateRelations')}
        </h2>
        <button
          onClick={() => setForm((p) => ({ ...p, relations: !p.relations }))}
          aria-pressed={form.relations}
          data-testid="toggle-relations"
          className={[
            'flex w-full items-center gap-3 rounded-card border-[1.5px] px-4 py-3 text-left transition-colors',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
            form.relations ? 'border-danger bg-danger-light' : 'border-border bg-surface',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-xs transition-colors ${
              form.relations
                ? 'border-danger bg-danger text-surface dark:text-bg-app'
                : 'border-border bg-transparent'
            }`}
          >
            {form.relations ? '♥' : ''}
          </span>
          <span>
            <span className={`block text-sm font-semibold ${form.relations ? 'text-danger' : 'text-text-main'}`}>
              {t('app.relationsHadToday')}
            </span>
            <span className="mt-0.5 block text-xs text-text-sec">{t('app.relationsVisibility')}</span>
          </span>
        </button>
      </section>

      {/* Notes */}
      <section className="mb-6">
        <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-text-sec">
          {t('dayDetail.notesLabel')}
        </h2>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder={t('app.notesPlaceholder')}
          aria-label={t('dayDetail.notesLabel')}
          maxLength={500}
          className="min-h-[72px] w-full rounded-card border border-border bg-surface px-4 py-3 text-base leading-relaxed text-text-main outline-none transition-colors placeholder:text-text-sec/70 focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
      </section>

      {!confirmNew ? (
        <Button
          variant="outline"
          fullWidth
          data-testid="start-new-cycle"
          onClick={() => setConfirmNew(true)}
          className="border-border font-semibold text-text-sec"
        >
          {t('app.startNewCycle')}
        </Button>
      ) : (
        <div className="rounded-2xl border border-danger/30 bg-danger-light p-4">
          <p className="mb-3 text-sm font-semibold text-danger">{t('app.confirmNewCycle')}</p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              data-testid="confirm-new-cycle"
              className="flex-1"
              onClick={() => {
                const f = { ...EMPTY_FORM, stamp: 'sangramento', bleeding: 'moderado' };
                onStartNewCycle(f, today());
                setConfirmNew(false);
              }}
            >
              {t('common.confirm')}
            </Button>
            <Button variant="ghost" className="flex-1 text-text-sec" onClick={() => setConfirmNew(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>

    {/* Sticky save CTA — LVL-18 */}
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-surface border-t border-border px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+80px)]">
      <Button
        onClick={() => form.stamp && onSave(form)}
        data-testid="save-observation"
        disabled={!form.stamp}
        fullWidth
        size="lg"
        className="uppercase tracking-wider"
      >
        {t('app.saveObservation')}
      </Button>
      {!form.stamp && (
        <p className="mt-1.5 text-center text-xs text-text-sec">{t('app.selectStampHint')}</p>
      )}
    </div>
  </>
  );
}
