/**
 * GraficoPage — cycle chart + history (extracted from App.jsx, Sprint 6 UI refresh).
 *
 * Clinical constraint: the chart shows only what the aluna recorded — stamps,
 * mucus, bleeding, relations. The recorded ápice day is displayed as a fact;
 * no phase or fertility interpretation is derived (removed in the 2026-06
 * audit: auto-derived "Fase Lútea" banner/stat violated the constraint).
 */
import { useTranslation } from 'react-i18next';
import { STAMPS } from '../constants.js';
import { today, fmtShort, getDay, genDays } from '../utils/dates.js';
import { Button, Card, EmptyState } from '../components/ui';

const BLEEDING_MARKS = { intenso: '●●●', moderado: '●●', leve: '●', manchas: '·' };
const MUCUS_MARKS = { opaco: 'Op', cremoso: 'Cr', transparente: 'Tr', elastico: 'El' };

export function GraficoPage({
  obs,
  cycleStart,
  history,
  todayN,
  selCycle,
  setSelCycle,
  onDayClick,
  onExportPDF,
  pdfLoading,
}) {
  const { t } = useTranslation();
  const vObs = selCycle ? selCycle.obs || {} : obs;
  const vStart = selCycle ? selCycle.start : cycleStart;
  const vDays = genDays(vStart, vObs);
  const apiceEntry = Object.entries(vObs).find(([, o]) => o.stamp === 'apice');
  const apiceN = apiceEntry ? vDays.find((d) => d.date === apiceEntry[0])?.n : null;

  return (
    <div className="pb-28">
      <header className="border-b border-border bg-surface px-5 pb-4 pt-6">
        <p className="mb-1 font-display text-xs uppercase tracking-[0.14em] text-text-sec">
          {t('app.cycleHistory')}
        </p>
        <h1 className="font-display text-2xl italic text-text-main">
          {selCycle ? selCycle.label : t('app.currentCycle')}
        </h1>
        <p className="mt-0.5 text-sm text-text-sec">
          {selCycle
            ? `${t('app.cycleStart')}${fmtShort(selCycle.start)} · ${t('app.days', { count: selCycle.duration || Object.keys(selCycle.obs || {}).length })}`
            : `${t('app.cycleStart')}${fmtShort(cycleStart)} · ${t('app.dayN', { n: todayN })} · ${t('app.records', { count: Object.keys(obs).length })}`}
        </p>
      </header>

      {/* Cycle selector */}
      <div className="overflow-x-auto border-b border-border bg-surface">
        <div className="flex min-w-max px-4" role="tablist" aria-label={t('app.cycleHistory')}>
          <button
            role="tab"
            aria-selected={!selCycle}
            onClick={() => setSelCycle(null)}
            className={`border-b-2 px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${!selCycle ? 'border-primary' : 'border-transparent'}`}
          >
            <span className={`block text-sm font-semibold ${!selCycle ? 'text-primary' : 'text-text-sec'}`}>
              {t('app.current')}
            </span>
            <span className="block text-xs text-text-sec">{t('app.dayN', { n: todayN })}</span>
          </button>
          {history.map((c, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={selCycle === c}
              onClick={() => setSelCycle(c)}
              className={`border-b-2 px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${selCycle === c ? 'border-primary' : 'border-transparent'}`}
            >
              <span className={`block text-sm font-semibold ${selCycle === c ? 'text-primary' : 'text-text-sec'}`}>
                {c.label}
              </span>
              <span className="block text-xs text-text-sec">
                {t('app.days', { count: c.duration || Object.keys(c.obs || {}).length })}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats — recorded facts only */}
      <div className="flex gap-2 border-b border-border px-5 py-3.5" data-testid="chart-stats">
        {[
          { l: t('app.statsRecords'), v: Object.keys(vObs).length, testid: 'chart-stat-registros' },
          { l: t('app.statsApice'), v: apiceN ? t('app.dayN', { n: apiceN }) : '—', testid: 'chart-stat-apice' },
          {
            l: t('app.statsDuration'),
            v: t('app.days', {
              count: selCycle ? selCycle.duration || Object.keys(vObs).length : todayN,
            }),
            testid: 'chart-stat-duracao',
          },
        ].map((s) => (
          <Card key={s.l} padded={false} className="flex-1 px-2 py-2.5 text-center" data-testid={s.testid}>
            <div className="font-display text-base font-bold text-text-main">{s.v}</div>
            <div className="mt-0.5 text-xs text-text-sec">{s.l}</div>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 border-b border-border bg-surface px-5 py-3" aria-hidden="true" data-testid="chart-legend">
        {STAMPS.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5" data-testid={`chart-legend-${s.id}`}>
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] font-serif text-[9px] font-bold"
              style={{ background: s.bg, borderColor: s.c, color: s.c }}
            >
              {s.sym}
            </span>
            <span className="text-xs text-text-sec">{t('stamps.' + s.id)}</span>
          </div>
        ))}
      </div>

      {/* Horizontal chart */}
      <div className="pt-4">
        <div className="overflow-x-auto">
          <div className="px-5" style={{ minWidth: vDays.length * 34 + 80 }}>
            {[
              {
                key: 'n',
                label: t('app.rowDay'),
                render: (d) => (
                  <div
                    className={`text-center text-xs ${d.date === today() && !selCycle ? 'font-bold text-secondary' : 'text-text-sec'}`}
                  >
                    {d.n}
                  </div>
                ),
              },
              {
                key: 'date',
                label: t('app.rowDate'),
                render: (d) => <div className="text-center text-[10px] text-text-sec">{getDay(d.date)}</div>,
              },
            ].map((row) => (
              <div key={row.key} className="mb-0.5 flex items-center">
                <div className="w-[60px] shrink-0 text-[10px] text-text-sec">{row.label}</div>
                {vDays.map((d) => (
                  <div key={d.n} className="w-8 shrink-0">
                    {row.render(d)}
                  </div>
                ))}
              </div>
            ))}

            {/* Stamps row — each day chip opens the DayDetailModal */}
            <div className="mb-1.5 flex items-center border-b border-border pb-1.5">
              <div className="w-[60px] shrink-0 text-[10px] font-semibold text-text-sec">{t('app.rowObs')}</div>
              {vDays.map((d) => {
                const s = STAMPS.find((x) => x.id === d.obs?.stamp);
                const isToday = d.date === today() && !selCycle;
                const isFut = d.date > today() && !selCycle;
                const hasObs = !!s && !isFut;
                const clickable = !selCycle;
                return (
                  <div key={d.n} className="flex w-8 shrink-0 justify-center">
                    <div
                      onClick={clickable ? () => onDayClick(d) : undefined}
                      aria-label={clickable ? t('dayDetail.cycleDayLabel', { n: d.n }) : undefined}
                      role={clickable ? 'button' : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') onDayClick(d);
                            }
                          : undefined
                      }
                      className={[
                        'flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] text-xs font-bold transition-colors',
                        isFut
                          ? 'border-border bg-transparent text-text-sec opacity-25'
                          : isToday
                            ? 'border-secondary bg-secondary text-text-main ring-2 ring-secondary/40 ring-offset-2 ring-offset-surface'
                            : hasObs
                              ? 'border-primary bg-primary text-surface dark:text-bg-app'
                              : 'border-border bg-border text-text-sec',
                        clickable ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary' : 'cursor-default',
                      ].join(' ')}
                    >
                      {s ? s.sym : ''}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Muco, Sang, Rel rows */}
            {[
              { label: t('app.rowMuco'), render: (d) => MUCUS_MARKS[d.obs?.mucus] || '', cls: 'text-warning' },
              { label: t('app.rowSang'), render: (d) => (d.obs?.bleeding ? BLEEDING_MARKS[d.obs.bleeding] || '●' : ''), cls: 'text-danger' },
              { label: t('app.rowRel'), render: (d) => (d.obs?.relations ? '♥' : ''), cls: 'text-danger' },
            ].map((row) => (
              <div key={row.label} className="mb-1 flex items-center">
                <div className="w-[60px] shrink-0 text-[10px] text-text-sec">{row.label}</div>
                {vDays.map((d) => (
                  <div key={d.n} className={`w-8 shrink-0 text-center text-xs ${row.cls}`}>
                    {row.render(d)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recorded ápice (fact, not interpretation) */}
      {apiceN && (
        <div className="mx-5 mt-3 flex items-center gap-3 rounded-card border border-warning/50 bg-warning-light px-4 py-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning font-serif text-sm font-bold text-surface dark:text-bg-app"
          >
            ✕
          </span>
          <span className="text-sm font-semibold text-warning">{t('app.apiceOnDay', { day: apiceN })}</span>
        </div>
      )}

      {/* PDF export */}
      <div className="px-5 pt-4">
        <Button onClick={onExportPDF} loading={pdfLoading} data-testid="export-pdf" fullWidth>
          {pdfLoading ? t('app.generatingPDF') : t('app.exportPDF')}
        </Button>
      </div>

      {/* Recent list */}
      <section className="px-5 pt-5">
        <h2 className="mb-3.5 font-display text-lg italic text-text-main">{t('app.recentRecords')}</h2>
        {!Object.keys(vObs).length ? (
          <EmptyState title={t('app.noRecords')} description={t('app.noRecordsHint')} />
        ) : (
          Object.entries(vObs)
            .sort(([a], [b]) => b.localeCompare(a))
            .slice(0, 10)
            .map(([date, o]) => {
              const s = STAMPS.find((x) => x.id === o.stamp);
              return (
                <Card key={date} padded={false} className="mb-2 flex items-start gap-3 px-3.5 py-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] font-serif text-lg font-bold"
                    style={{ background: s?.bg, borderColor: s?.c, color: s?.c }}
                  >
                    {s?.sym || '·'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="font-display text-base text-text-main">{fmtShort(date)}</span>
                      <span className="flex items-center gap-1.5">
                        {o.stamp === 'apice' && (
                          <span className="rounded-full border border-warning/50 bg-warning-light px-2 py-0.5 text-xs font-bold text-warning">
                            {t('stamps.apice')}
                          </span>
                        )}
                        {o.relations && <span aria-hidden="true" className="text-sm text-danger">♥</span>}
                      </span>
                    </div>
                    <p className="text-xs text-text-sec">
                      {s && t('stamps.' + s.id)}
                      {o.mucus && ` · ${t('mucus.' + o.mucus)}`}
                      {o.bleeding && ` · ${t('bleeding.' + o.bleeding)}`}
                    </p>
                    {o.notes && <p className="mt-1 text-xs italic text-text-sec">{o.notes}</p>}
                  </div>
                </Card>
              );
            })
        )}
      </section>
    </div>
  );
}
