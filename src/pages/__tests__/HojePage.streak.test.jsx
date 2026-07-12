// @vitest-environment jsdom
/**
 * Unit tests — HojePage: daily registration streak indicator.
 *
 * TDD RED phase: written BEFORE the implementation.
 *
 * Covers:
 *  - Streak indicator renders with data-testid="streak-indicator"
 *  - Shows real text (not emoji-only) — accessible
 *  - Streak 0 (no obs) shows "start your streak" message
 *  - Streak > 0 shows the count in a human-readable string
 *  - Clinical constraint: no fertile/infertile/safe/unsafe language
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HojePage } from '../HojePage.jsx';

afterEach(cleanup);

// ── Mock react-i18next ────────────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const map = {
        // Streak keys
        'streak.days': `${opts?.count ?? 0} dias seguidos de registro`,
        'streak.zero': 'Comece sua sequência hoje',
        // Existing keys used by HojePage
        'app.observacaoHoje': 'Observação de hoje',
        'app.savedToday': 'Observação de hoje salva',
        'app.saveObservation': 'Salvar observação',
        'app.selectStampHint': 'Escolha uma observação acima para salvar',
        'app.startNewCycle': '+ Iniciar novo ciclo',
        'app.confirmNewCycle': 'Confirma?',
        'app.relationsHadToday': 'Houve relação íntima hoje',
        'app.relationsVisibility': 'Visível apenas para a instrutora',
        'app.notesPlaceholder': 'Notas...',
        'dayDetail.intimateRelations': 'Relações íntimas',
        'dayDetail.notesLabel': 'Notas para a instrutora',
        'dayDetail.sensation': 'Sensação',
        'dayDetail.mucusType': 'Tipo de muco',
        'dayDetail.noMucus': 'Sem muco',
        'dayDetail.apiceMarked': 'Ápice marcado',
        'dayDetail.intensity': 'Intensidade',
      };
      return map[key] ?? key;
    },
  }),
}));

// ── Mock Button ───────────────────────────────────────────────────────────────
vi.mock('../../components/ui', () => ({
  Button: ({ children, onClick, disabled, 'data-testid': testId, className, fullWidth, size, variant }) => (
    <button onClick={onClick} disabled={disabled} data-testid={testId} className={className}>
      {children}
    </button>
  ),
}));

// ── Mock dates.js so today() returns a deterministic value ────────────────────
vi.mock('../../utils/dates.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    today: () => '2026-07-11',
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeForm(overrides = {}) {
  return {
    stamp: null,
    mucus: null,
    bleeding: null,
    sensacao: null,
    tipo_observacao: null,
    notes: '',
    relations: false,
    observacao_descricao: null,
    ...overrides,
  };
}

function renderPage(obsOverride = {}, formOverrides = {}) {
  const form = makeForm(formOverrides);
  const utils = render(
    <HojePage
      form={form}
      setForm={vi.fn()}
      saved={false}
      confirmNew={false}
      setConfirmNew={vi.fn()}
      onSave={vi.fn()}
      onStartNewCycle={vi.fn()}
      obs={obsOverride}
    />,
  );
  return utils;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HojePage — streak indicator', () => {
  it('renders the streak indicator element', () => {
    const obs = { '2026-07-10': { stamp: 'seco' }, '2026-07-11': { stamp: 'seco' } };
    renderPage(obs);
    expect(screen.queryByTestId('streak-indicator')).toBeInTheDocument();
  });

  it('displays the streak count with human-readable text when streak > 0', () => {
    const obs = { '2026-07-09': { stamp: 'seco' }, '2026-07-10': { stamp: 'seco' }, '2026-07-11': { stamp: 'seco' } };
    renderPage(obs);
    const indicator = screen.getByTestId('streak-indicator');
    // Must have text content, not emoji-only (accessibility requirement)
    expect(indicator.textContent.trim().length).toBeGreaterThan(0);
    // Count "3" must appear somewhere in the indicator text
    expect(indicator.textContent).toContain('3');
  });

  it('shows a "start your streak" message when streak is 0', () => {
    renderPage({}); // empty obs — no streak
    const indicator = screen.getByTestId('streak-indicator');
    expect(indicator.textContent).toContain('Comece sua sequência hoje');
  });

  it('indicator is still present when obs is not provided (defaults gracefully)', () => {
    // obs prop not passed — component should default to {}
    const form = makeForm();
    render(
      <HojePage
        form={form}
        setForm={vi.fn()}
        saved={false}
        confirmNew={false}
        setConfirmNew={vi.fn()}
        onSave={vi.fn()}
        onStartNewCycle={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('streak-indicator')).toBeInTheDocument();
  });

  it('does not render clinical classification labels (clinical constraint)', () => {
    const obs = { '2026-07-10': { stamp: 'muco' }, '2026-07-11': { stamp: 'apice' } };
    const { container } = renderPage(obs);
    expect(container.textContent ?? '').not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });

  it('streak indicator has non-empty accessible text content', () => {
    const obs = { '2026-07-11': { stamp: 'seco' } };
    renderPage(obs);
    const el = screen.getByTestId('streak-indicator');
    // textContent must be non-trivial (not just whitespace or a lone emoji)
    expect(el.textContent.replace(/\s/g, '').length).toBeGreaterThan(1);
  });
});
