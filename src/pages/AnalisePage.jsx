/**
 * AnalisePage — observational cycle statistics (extracted from App.jsx).
 *
 * 2026-06 audit C-1: this page previously displayed "PBI confirmado",
 * auto-derived "Fase Lútea" stats and pregnancy-test advice — fertility
 * classification, which is the certified instrutora's exclusive
 * responsibility (workspace clinical constraint, auto-Critical). It now shows
 * only neutral, recorded facts: cycle lengths and the days the aluna herself
 * stamped as ápice. No interpretation is derived or displayed.
 */
import { BarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState } from '../components/ui';

export function AnalisePage({ stats, onNavigate }) {
  const { t } = useTranslation();

  const sections = stats
    ? [
        {
          title: t('app.sectionCycleDuration'),
          items: [
            { l: t('app.labelMean'), v: stats.avgLength ? t('app.days', { count: stats.avgLength }) : '—' },
            { l: t('app.labelMin'), v: stats.minLength ? t('app.days', { count: stats.minLength }) : '—' },
            { l: t('app.labelMax'), v: stats.maxLength ? t('app.days', { count: stats.maxLength }) : '—' },
          ],
        },
        {
          title: t('app.sectionApiceDay'),
          items: [
            { l: t('app.labelAvg'), v: stats.avgApice ? t('app.dayN', { n: stats.avgApice }) : '—' },
            { l: t('app.labelEarliest'), v: stats.minApice ? t('app.dayN', { n: stats.minApice }) : '—' },
            { l: t('app.labelLatest'), v: stats.maxApice ? t('app.dayN', { n: stats.maxApice }) : '—' },
          ],
        },
      ]
    : [];

  return (
    <div className="pb-28">
      <header className="border-b border-border bg-surface px-5 pb-4 pt-6">
        <p className="mb-1 font-display text-xs uppercase tracking-[0.14em] text-text-sec">
          {t('app.patternsLabel')}
        </p>
        <h1 className="font-display text-2xl italic text-text-main">{t('app.cycleAnalysis')}</h1>
        <p className="mt-0.5 text-sm text-text-sec">
          {t('app.analysisBasedOn', { count: stats?.cycleCount || 0 })}
        </p>
      </header>

      {!stats ? (
        <div className="px-5 pt-6">
          <EmptyState
            data-testid="analise-empty-state"
            icon={<BarChart2 />}
            title={t('app.analysisMinCycles')}
            description={t('app.analysisEmptyHint', { defaultValue: 'O gráfico mostrará a duração dos seus ciclos e os dias de ápice registrados.' })}
            action={
              onNavigate ? (
                <button
                  data-testid="analise-empty-goto-grafico"
                  onClick={() => onNavigate('grafico')}
                  className="rounded-btn bg-primary px-6 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-bg-app"
                >
                  {t('app.analysisEmptyAction', { defaultValue: 'Ver meu gráfico' })}
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="px-5 pt-5">
          {sections.map((section) => (
            <Card key={section.title} className="mb-3.5">
              <h2 className="mb-3 font-display text-base text-text-main">{section.title}</h2>
              <div className="flex gap-2">
                {section.items.map((item) => (
                  <div key={item.l} className="flex-1 rounded-lg bg-bg-app px-2 py-2.5 text-center">
                    <div className="font-display text-base font-bold text-text-main">{item.v}</div>
                    <div className="mt-0.5 text-xs text-text-sec">{item.l}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {/* Interpretation belongs to the instrutora — permanent, not dismissible */}
          <Card className="mt-1">
            <p className="text-center text-xs italic leading-relaxed text-text-sec">
              {t('app.analysisDisclaimer')}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
