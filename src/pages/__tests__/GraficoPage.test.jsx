// @vitest-environment jsdom
/**
 * Unit tests — GraficoPage: Empty state (LVL-19), Hoje marker (LVL-12), chip press (LVL-16)
 *
 * Covers:
 *  - Empty state renders EmptyState with FileText icon when no observations (LVL-19)
 *  - "Hoje" label appears below today's chip in current-cycle view (LVL-12)
 *  - "Hoje" label is absent in history views (selCycle !== null) (LVL-12)
 *  - Clickable chip has active:scale-90 micro-interaction class (LVL-16)
 *  - Clinical constraint: no fertile/infertile classification rendered
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);

import { GraficoPage } from '../GraficoPage.jsx';

// ── Mock react-i18next ────────────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const map = {
        'app.cycleHistory': 'Histórico de ciclos',
        'app.currentCycle': 'Ciclo atual',
        'app.cycleStart': 'Início: ',
        'app.days': `${opts?.count ?? 0} dias`,
        'app.dayN': `Dia ${opts?.n ?? 0}`,
        'app.records': `${opts?.count ?? 0} registros`,
        'app.current': 'Atual',
        'app.statsRecords': 'Registros',
        'app.statsApice': 'Ápice',
        'app.statsDuration': 'Duração',
        'app.rowDay': 'Dia',
        'app.rowDate': 'Data',
        'app.rowObs': 'Obs.',
        'app.rowMuco': 'Muco',
        'app.rowSang': 'Sang.',
        'app.rowRel': 'Rel.',
        'app.recentRecords': 'Registros recentes',
        'app.noRecords': 'Nenhum registro.',
        'app.noRecordsHint': 'Registre a observação de hoje na aba Hoje.',
        'app.today': 'Hoje',
        'app.apiceOnDay': `Ápice no dia ${opts?.day ?? 0}`,
        'app.generatingPDF': 'Gerando PDF…',
        'app.exportPDF': 'Exportar PDF',
        'dayDetail.cycleDayLabel': `Dia ${opts?.n ?? 0} do ciclo`,
        'stamps.sangramento': 'Sangramento',
        'stamps.seco': 'Seco',
        'stamps.muco': 'Muco',
        'stamps.apice': 'Ápice',
        'mucus.opaco': 'Opaco',
        'mucus.cremoso': 'Cremoso',
        'mucus.transparente': 'Transparente',
        'mucus.elastico': 'Elástico',
        'bleeding.intenso': 'Intenso',
        'bleeding.moderado': 'Moderado',
        'bleeding.leve': 'Leve',
        'bleeding.manchas': 'Manchas',
      };
      return map[key] ?? key;
    },
  }),
}));

// ── Mock lucide-react icons ───────────────────────────────────────────────────
vi.mock('lucide-react', () => ({
  FileText: (props) => <svg data-testid="icon-file-text" aria-hidden="true" {...props} />,
}));

// ── Mock UI components ────────────────────────────────────────────────────────
vi.mock('../../components/ui', () => ({
  Button: ({ children, onClick, loading, 'data-testid': testId, fullWidth, ...rest }) => (
    <button onClick={onClick} data-testid={testId} disabled={loading} {...rest}>
      {children}
    </button>
  ),
  Card: ({ children, className, padded, 'data-testid': testId, ...rest }) => (
    <div data-testid={testId} className={className} {...rest}>
      {children}
    </div>
  ),
  EmptyState: ({ icon, title, description, 'data-testid': testId }) => (
    <div data-testid={testId ?? 'empty-state'}>
      {icon && <div data-testid="empty-state-icon">{icon}</div>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  ),
}));

// ── Mock dates utils ──────────────────────────────────────────────────────────
const FAKE_TODAY = '2026-07-01';
vi.mock('../../utils/dates.js', () => ({
  today: () => FAKE_TODAY,
  fmtShort: (ds) => ds,
  getDay: (ds) => parseInt(ds.split('-')[2], 10),
  genDays: (startDate, obs = {}, total = 35) => {
    const days = [];
    const start = new Date(startDate + 'T12:00:00');
    for (let i = 0; i < Math.min(total, 5); i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const date = d.toISOString().split('T')[0];
      days.push({ n: i + 1, date, obs: obs[date] || null });
    }
    return days;
  },
}));

// ── Mock constants ────────────────────────────────────────────────────────────
vi.mock('../../constants.js', () => ({
  STAMPS: [
    { id: 'sangramento', sym: '●', bg: '#F5E8E8', c: '#A03030' },
    { id: 'seco', sym: '|', bg: '#E4F0E8', c: '#2E6040' },
    { id: 'muco', sym: '○', bg: '#F5ECD4', c: '#806020' },
    { id: 'apice', sym: '✕', bg: '#F0DCD4', c: '#8C3C28' },
  ],
}));

// ── Base props ────────────────────────────────────────────────────────────────
function makeProps(overrides = {}) {
  return {
    obs: {},
    cycleStart: '2026-06-01',
    history: [],
    todayN: 31,
    selCycle: null,
    setSelCycle: vi.fn(),
    onDayClick: vi.fn(),
    onExportPDF: vi.fn(),
    pdfLoading: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GraficoPage — Empty state (LVL-19)', () => {
  it('renders EmptyState with FileText icon when obs is empty', () => {
    render(<GraficoPage {...makeProps({ obs: {} })} />);
    expect(screen.getByTestId('empty-state')).toBeTruthy();
    expect(screen.getByTestId('icon-file-text')).toBeTruthy();
  });

  it('renders the noRecords title in the empty state', () => {
    render(<GraficoPage {...makeProps({ obs: {} })} />);
    expect(screen.getByText('Nenhum registro.')).toBeTruthy();
  });

  it('renders the noRecordsHint description in the empty state', () => {
    render(<GraficoPage {...makeProps({ obs: {} })} />);
    expect(screen.getByText('Registre a observação de hoje na aba Hoje.')).toBeTruthy();
  });

  it('keeps the "Registros recentes" heading above the empty state', () => {
    render(<GraficoPage {...makeProps({ obs: {} })} />);
    expect(screen.getByText('Registros recentes')).toBeTruthy();
    expect(screen.getByTestId('empty-state')).toBeTruthy();
  });

  it('does NOT render EmptyState when obs has entries', () => {
    const obs = { [FAKE_TODAY]: { stamp: 'seco' } };
    render(<GraficoPage {...makeProps({ obs })} />);
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});

describe('GraficoPage — Hoje marker (LVL-12)', () => {
  it('renders "Hoje" label in the current-cycle view for today\'s chip', () => {
    const obs = {};
    render(<GraficoPage {...makeProps({ obs, cycleStart: FAKE_TODAY })} />);
    expect(screen.getByText('Hoje')).toBeTruthy();
  });

  it('does NOT render "Hoje" label in history view (selCycle !== null)', () => {
    const historyCycle = {
      obs: {},
      start: '2026-05-01',
      label: 'Maio 2026',
      duration: 28,
    };
    render(
      <GraficoPage
        {...makeProps({
          obs: {},
          selCycle: historyCycle,
          cycleStart: FAKE_TODAY,
        })}
      />,
    );
    // "Hoje" tab label exists in the tab list but not as a chip marker
    // The chip marker is the small div below the chip — verify it's not present
    // by checking for the specific small text element (8px, text-secondary)
    const allHoje = screen.queryAllByText('Hoje');
    // The "Atual" tab text says "Atual", "Hoje" may appear as tab text — check none is a chip marker
    // In history view there should be NO chip-level Hoje label rendered
    // Our mock genDays uses the historyCycle.start so no date matches FAKE_TODAY
    // (history cycle started in May; generated days are May 1–5, not July 1)
    expect(allHoje.length).toBe(0);
  });
});

describe('GraficoPage — Chip press micro-interaction (LVL-16)', () => {
  it('clickable chip includes active:scale-90 class', () => {
    const obs = {};
    const { container } = render(
      <GraficoPage {...makeProps({ obs, cycleStart: FAKE_TODAY })} />,
    );
    const chips = container.querySelectorAll('[role="button"]');
    expect(chips.length).toBeGreaterThan(0);
    const firstChip = chips[0];
    expect(firstChip.className).toContain('active:scale-90');
  });

  it('clickable chip includes motion-reduce:active:scale-100 class', () => {
    const { container } = render(<GraficoPage {...makeProps()} />);
    const chips = container.querySelectorAll('[role="button"]');
    const firstChip = chips[0];
    expect(firstChip.className).toContain('motion-reduce:active:scale-100');
  });
});

describe('GraficoPage — Clinical constraint', () => {
  it('does not render any fertility classification label', () => {
    const { container } = render(<GraficoPage {...makeProps()} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });
});
