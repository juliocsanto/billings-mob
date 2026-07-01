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
 *  - Clinical constraint: no fertile/infertile classification rendered
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
});
