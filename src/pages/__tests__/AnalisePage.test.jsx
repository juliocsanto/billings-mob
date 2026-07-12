// @vitest-environment jsdom
/**
 * AnalisePage unit tests.
 *
 * Covers:
 *  - Empty state (stats=null) renders EmptyState component with BarChart2 icon
 *  - Empty state shows the analysisMinCycles message as title
 *  - Empty state shows "Ver meu gráfico" action button when onNavigate is provided
 *  - Action button calls onNavigate('grafico') on click
 *  - No action button when onNavigate is not provided
 *  - Stats view renders cycle duration and ápice sections when stats are provided
 *  - New neutral stats: variability (analise-variability), streak (analise-streak)
 *  - Historical trend chart (analise-trend-chart) renders given cycle length data
 *  - CLINICAL GUARD: no fertility terms, luteal/BIP/flags values, no predictions rendered
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AnalisePage } from '../AnalisePage.jsx';

afterEach(cleanup);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const strings = {
        'app.patternsLabel': 'Padrões',
        'app.cycleAnalysis': 'Análise de ciclos',
        'app.analysisBasedOn': 'Baseada nos últimos {{count}} ciclos',
        'app.analysisMinCycles': 'Registre pelo menos 2 ciclos completos para ver a análise.',
        'app.sectionCycleDuration': 'Duração do ciclo',
        'app.sectionApiceDay': 'Dia do ápice',
        'app.labelMean': 'Média',
        'app.labelMin': 'Mín',
        'app.labelMax': 'Máx',
        'app.labelAvg': 'Média',
        'app.labelEarliest': 'Mais cedo',
        'app.labelLatest': 'Mais tarde',
        'app.days': '{{count}} dias',
        'app.dayN': 'Dia {{n}}',
        'app.analysisDisclaimer': 'Esta análise é uma ferramenta de apoio ao registro.',
        // New keys — neutral stats & trend
        'app.labelVariability': 'Variação',
        'app.labelRegistrationStreak': 'Sequência de registros',
        'app.sectionCycleTrend': 'Histórico de ciclos',
        'app.cycleTrendAvgLabel': 'Média',
      };
      const val = strings[key] ?? (opts?.defaultValue ?? key);
      if (opts && typeof opts === 'object') {
        return val.replace(/\{\{(\w+)\}\}/g, (_, k) => opts[k] ?? `{{${k}}}`);
      }
      return val;
    },
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
}));

const mockStats = {
  cycleCount: 3,
  avgLength: 28,
  minLength: 26,
  maxLength: 30,
  avgApice: 14,
  minApice: 12,
  maxApice: 16,
};

/** Stats object that mirrors the FULL computeMultiCycleStats output including
 *  the dangerous fields (avgLuteal, bipConfirmed, flags) that must NOT render. */
const clinicalGuardStats = {
  cycleCount: 4,
  avgLength: 28.5,
  minLength: 26,
  maxLength: 31,
  avgApice: 14,
  minApice: 12,
  maxApice: 16,
  stdDevLength: 2.1,
  cycleLengths: [
    { index: 1, length: 26 },
    { index: 2, length: 28 },
    { index: 3, length: 31 },
    { index: 4, length: 29 },
  ],
  // These dangerous fields are present in the stats object but must NOT be rendered:
  avgLuteal: 13.5,
  minLuteal: 11,
  maxLuteal: 16,
  bipConfirmed: true,
  bipDescriptors: ['seco', 'seco', 'seco'],
  flags: [
    { level: 'ok', msg: 'Padrão dentro do intervalo esperado.' },
    { level: 'atenção', msg: 'Fase pós-Ápice mais curta que o habitual (11 dias).' },
  ],
};

describe('AnalisePage', () => {
  describe('empty state (stats = null)', () => {
    it('renders the EmptyState component with data-testid', () => {
      render(<AnalisePage stats={null} />);
      expect(screen.getByTestId('analise-empty-state')).toBeInTheDocument();
    });

    it('shows the analysisMinCycles message as the empty state title', () => {
      render(<AnalisePage stats={null} />);
      expect(
        screen.getByText('Registre pelo menos 2 ciclos completos para ver a análise.'),
      ).toBeInTheDocument();
    });

    it('renders the BarChart2 icon inside the empty state (svg present)', () => {
      render(<AnalisePage stats={null} />);
      const emptyState = screen.getByTestId('analise-empty-state');
      const svg = emptyState.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('shows "Ver meu gráfico" button when onNavigate is provided', () => {
      render(<AnalisePage stats={null} onNavigate={vi.fn()} />);
      expect(screen.getByTestId('analise-empty-goto-grafico')).toBeInTheDocument();
    });

    it('calls onNavigate("grafico") when action button is clicked', () => {
      const onNavigate = vi.fn();
      render(<AnalisePage stats={null} onNavigate={onNavigate} />);
      fireEvent.click(screen.getByTestId('analise-empty-goto-grafico'));
      expect(onNavigate).toHaveBeenCalledWith('grafico');
    });

    it('does not render the action button when onNavigate is absent', () => {
      render(<AnalisePage stats={null} />);
      expect(screen.queryByTestId('analise-empty-goto-grafico')).toBeNull();
    });
  });

  describe('stats view', () => {
    it('renders cycle duration section when stats are provided', () => {
      render(<AnalisePage stats={mockStats} />);
      expect(screen.getByText('Duração do ciclo')).toBeInTheDocument();
    });

    it('renders the ápice section when stats are provided', () => {
      render(<AnalisePage stats={mockStats} />);
      expect(screen.getByText('Dia do ápice')).toBeInTheDocument();
    });

    it('does not render the empty state when stats are provided', () => {
      render(<AnalisePage stats={mockStats} />);
      expect(screen.queryByTestId('analise-empty-state')).toBeNull();
    });

    it('clinical constraint: never renders fertil/infertil/seguro/inseguro', () => {
      const { container } = render(<AnalisePage stats={mockStats} />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
    });
  });

  describe('new neutral stats — variability', () => {
    it('renders analise-variability when stdDevLength is present', () => {
      render(<AnalisePage stats={{ ...mockStats, stdDevLength: 2.5 }} />);
      expect(screen.getByTestId('analise-variability')).toBeInTheDocument();
    });

    it('renders analise-variability showing — when stdDevLength is absent', () => {
      render(<AnalisePage stats={mockStats} />);
      expect(screen.getByTestId('analise-variability')).toBeInTheDocument();
    });
  });

  describe('new neutral stats — registration streak', () => {
    it('renders analise-streak element when stats are present', () => {
      render(<AnalisePage stats={mockStats} obs={{}} />);
      expect(screen.getByTestId('analise-streak')).toBeInTheDocument();
    });

    it('renders streak card even when obs is undefined', () => {
      render(<AnalisePage stats={mockStats} />);
      expect(screen.getByTestId('analise-streak')).toBeInTheDocument();
    });
  });

  describe('trend chart', () => {
    it('renders analise-trend-chart when cycleLengths has data', () => {
      const statsWithTrend = {
        ...mockStats,
        cycleLengths: [
          { index: 1, length: 26 },
          { index: 2, length: 28 },
          { index: 3, length: 30 },
        ],
      };
      render(<AnalisePage stats={statsWithTrend} />);
      expect(screen.getByTestId('analise-trend-chart')).toBeInTheDocument();
    });

    it('does not render analise-trend-chart when cycleLengths is absent', () => {
      render(<AnalisePage stats={mockStats} />);
      expect(screen.queryByTestId('analise-trend-chart')).toBeNull();
    });
  });

  describe('CLINICAL GUARD — dedicated test (auto-Critical constraint)', () => {
    it('never renders fertility terms, luteal/BIP/flags content with full stats object', () => {
      const { container } = render(<AnalisePage stats={clinicalGuardStats} obs={{}} />);
      const text = container.textContent ?? '';

      // Fertility classification terms — forbidden (C-1 audit)
      expect(text).not.toMatch(/f[eé]rtil/i);
      expect(text).not.toMatch(/inf[eé]rtil/i);
      expect(text).not.toMatch(/\bseguro\b/i);
      expect(text).not.toMatch(/\binseguro\b/i);
      expect(text).not.toMatch(/janela f[eé]rtil/i);
      expect(text).not.toMatch(/per[ií]odo f[eé]rtil/i);
      expect(text).not.toMatch(/dias f[eé]rteis/i);

      // Prediction/estimation terms — forbidden
      expect(text).not.toMatch(/previ[sã][aã]o/i);
      expect(text).not.toMatch(/estimati/i);
      expect(text).not.toMatch(/pr[oó]ximo [aá]pice/i);
      expect(text).not.toMatch(/ovula[cç][aã]o/i);

      // Luteal phase — must NOT render (removed in C-1 audit)
      expect(text).not.toMatch(/lut[eé]al/i);
      expect(text).not.toMatch(/l[uú]tea/i);

      // BIP/PBI — must NOT render
      expect(text).not.toMatch(/\bBIP\b/);
      expect(text).not.toMatch(/\bPBI\b/);
      expect(text).not.toMatch(/padr[aã]o b[aá]sico/i);

      // Flag messages from stats.flags — must NOT render
      expect(text).not.toContain('Fase pós-Ápice mais curta');

      // avgLuteal value must not appear literally
      expect(text).not.toContain('13.5');

      // The disclaimer card must still be present
      expect(text).toContain('ferramenta de apoio ao registro');
    });
  });
});
