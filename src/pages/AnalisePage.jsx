/**
 * AnalisePage — observational cycle statistics (extracted from App.jsx).
 *
 * 2026-06 audit C-1: this page previously displayed "PBI confirmado",
 * auto-derived "Fase Lútea" stats and pregnancy-test advice — fertility
 * classification, which is the certified instrutora's exclusive
 * responsibility (workspace clinical constraint, auto-Critical). It now shows
 * only neutral, recorded facts: cycle lengths and the days the aluna herself
 * stamped as ápice. No interpretation is derived or displayed.
 *
 * 2026-07 expansion: added cycle-length variability (std dev), registration
 * streak, and a lightweight inline-SVG historical trend chart of cycle
 * durations. NO chart library added — plain SVG + Tailwind tokens only.
 * The luteal/BIP/flags fields in the stats object continue to be ignored.
 */
import { BarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState } from '../components/ui';
import { computeStreak } from '../utils/streak.js';
import { today } from '../utils/dates.js';

// ── Inline-SVG historical trend chart — no external library ───────────────────
// Renders each past cycle's duration as a vertical bar; the average is marked
// as a dashed horizontal line. Plain arithmetic — no clinical inference.

const CHART_H = 64;   // inner bar-area height (px)
const LABEL_H = 14;   // height below bars for cycle-index labels
const BAR_W   = 20;   // bar width
const BAR_GAP = 6;    // gap between bars
const PAD     = 6;    // left/right padding inside the SVG

function CycleLengthTrendChart({ cycleLengths, avgLength, t }) {
  if (!cycleLengths || cycleLengths.length < 1) return null;

  const lengths = cycleLengths.map((c) => c.length);
  const maxLen  = Math.max(...lengths);
  const minLen  = Math.min(...lengths);
  const span    = Math.max(maxLen - minLen, 1); // guard against all-same lengths

  // Keep a guaranteed base height so even the shortest bar is visually present.
  const BASE_H  = 10;
  const SCALE_H = CHART_H - BASE_H;
  const barH    = (len) => BASE_H + Math.round(((len - minLen) / span) * SCALE_H);

  // Average line: Y measured from SVG top (0 = top, CHART_H = bottom of bar area)
  const avgBarH = BASE_H + Math.round(((avgLength - minLen) / span) * SCALE_H);
  const avgY    = CHART_H - avgBarH;

  const totalW = PAD + cycleLengths.length * (BAR_W + BAR_GAP) - BAR_GAP + PAD;
  const totalH = CHART_H + LABEL_H;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      className="w-full"
      aria-label={t('app.sectionCycleTrend')}
      data-testid="analise-trend-chart"
      role="img"
    >
      {cycleLengths.map(({ index, length }, i) => {
        const x = PAD + i * (BAR_W + BAR_GAP);
        const h = barH(length);
        const y = CHART_H - h;
        return (
          <g key={index}>
            <rect
              x={x}
              y={y}
              width={BAR_W}
              height={h}
              fill="rgb(var(--color-primary) / 0.65)"
              rx="2"
            />
            <text
              x={x + BAR_W / 2}
              y={totalH - 2}
              textAnchor="middle"
              fontSize="8"
              fill="currentColor"
              opacity="0.6"
            >
              {index}
            </text>
          </g>
        );
      })}

      {/* Average duration line */}
      {avgLength !== null && avgLength !== undefined && (
        <line
          x1={0}
          y1={avgY}
          x2={totalW}
          y2={avgY}
          stroke="rgb(var(--color-secondary))"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
      )}
    </svg>
  );
}

// ── Page component ─────────────────────────────────────────────────────────────

export function AnalisePage({ stats, obs, onNavigate }) {
  const { t } = useTranslation();

  // Registration streak — neutral behavioral count, no fertility inference.
  // computeStreak returns 0 gracefully when obs is null/empty.
  const streak = computeStreak(obs ?? null, today());

  const sections = stats
    ? [
        {
          title: t('app.sectionCycleDuration'),
          items: [
            { l: t('app.labelMean'),        v: stats.avgLength   ? t('app.days', { count: stats.avgLength })   : '—' },
            { l: t('app.labelMin'),         v: stats.minLength   ? t('app.days', { count: stats.minLength })   : '—' },
            { l: t('app.labelMax'),         v: stats.maxLength   ? t('app.days', { count: stats.maxLength })   : '—' },
            {
              l: t('app.labelVariability'),
              v: stats.stdDevLength !== null && stats.stdDevLength !== undefined ? `±${stats.stdDevLength}` : '—',
              testId: 'analise-variability',
            },
          ],
        },
        {
          title: t('app.sectionApiceDay'),
          items: [
            { l: t('app.labelAvg'),      v: stats.avgApice ? t('app.dayN', { n: stats.avgApice }) : '—' },
            { l: t('app.labelEarliest'), v: stats.minApice ? t('app.dayN', { n: stats.minApice }) : '—' },
            { l: t('app.labelLatest'),   v: stats.maxApice ? t('app.dayN', { n: stats.maxApice }) : '—' },
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
              <div className="flex flex-wrap gap-2">
                {section.items.map((item) => (
                  <div
                    key={item.l}
                    className="flex-1 rounded-lg bg-bg-app px-2 py-2.5 text-center"
                    data-testid={item.testId ?? undefined}
                  >
                    <div className="font-display text-base font-bold text-text-main">{item.v}</div>
                    <div className="mt-0.5 text-xs text-text-sec">{item.l}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {/* Registration streak — neutral behavioral count */}
          <Card className="mb-3.5" data-testid="analise-streak">
            <h2 className="mb-3 font-display text-base text-text-main">
              {t('app.labelRegistrationStreak')}
            </h2>
            <div className="flex gap-2">
              <div className="flex-1 rounded-lg bg-bg-app px-2 py-2.5 text-center">
                <div className="font-display text-2xl font-bold text-text-main">
                  {streak > 0 ? streak : '—'}
                </div>
                <div className="mt-0.5 text-xs text-text-sec">
                  {streak > 0
                    ? t('app.days', { count: streak })
                    : t('app.labelRegistrationStreak')}
                </div>
              </div>
            </div>
          </Card>

          {/* Historical trend chart — cycle duration over time */}
          {stats.cycleLengths && stats.cycleLengths.length > 0 && (
            <Card className="mb-3.5">
              <h2 className="mb-3 font-display text-base text-text-main">
                {t('app.sectionCycleTrend')}
              </h2>
              <CycleLengthTrendChart
                cycleLengths={stats.cycleLengths}
                avgLength={stats.avgLength}
                t={t}
              />
              <p className="mt-2 text-right text-xs text-text-sec">
                {t('app.cycleTrendAvgLabel')} — <span className="font-semibold">{stats.avgLength} dias</span>
              </p>
            </Card>
          )}

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
