// @vitest-environment jsdom
/**
 * Unit tests — HojePage: mucus detail for all non-bleeding stamps (Feedback MOB
 * 2026-07-02) + affirmative-only relations toggle.
 *
 * Covers:
 *  - Tipo de muco section renders for stamps seco, muco AND apice (parity with
 *    DayDetailModal), never for sangramento or when no stamp is selected
 *  - "Sem muco" pill is active when form.mucus is null; clicking it clears mucus
 *  - Selecting a mucus quality updates form.mucus; clicking it again toggles off
 *  - onSave payload carries mucus when stamp is apice
 *  - Relations control shows a single affirmative label — the unchecked state
 *    never claims "não houve relação" (it only offers marking that one occurred)
 *
 * Clinical constraint: no fertile/infertile language anywhere in this component.
 * LGPD: relations value is a boolean toggle only — never logged.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { HojePage } from '../HojePage.jsx';

// ── Mock react-i18next ────────────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        'app.relationsHadToday': 'Houve relação íntima hoje',
        'app.relationsVisibility': 'Visível apenas para sua instrutora',
        'dayDetail.mucusType': 'Tipo de muco',
        'dayDetail.noMucus': 'Sem muco',
        'dayDetail.intimateRelations': 'Relações íntimas',
        'mucus.opaco': 'Opaco / Pegajoso',
        'mucus.cremoso': 'Cremoso',
        'mucus.transparente': 'Transparente',
        'mucus.elastico': 'Fios elásticos',
        'mucus.opaco_desc': 'desc',
        'mucus.cremoso_desc': 'desc',
        'mucus.transparente_desc': 'desc',
        'mucus.elastico_desc': 'desc',
      };
      return map[key] ?? key;
    },
  }),
}));

// ── Mock Button component — renders a plain <button> ─────────────────────────
vi.mock('../../components/ui', () => ({
  Button: ({ children, onClick, disabled, 'data-testid': testId, className }) => (
    <button onClick={onClick} disabled={disabled} data-testid={testId} className={className}>
      {children}
    </button>
  ),
}));

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

function renderPage(formOverrides = {}) {
  const form = makeForm(formOverrides);
  const setForm = vi.fn();
  const onSave = vi.fn();

  const utils = render(
    <HojePage
      form={form}
      setForm={setForm}
      saved={false}
      confirmNew={false}
      setConfirmNew={vi.fn()}
      onSave={onSave}
      onStartNewCycle={vi.fn()}
    />,
  );

  return { ...utils, form, setForm, onSave };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HojePage — Tipo de muco for non-bleeding stamps (modal parity)', () => {
  it.each(['seco', 'muco', 'apice'])('renders the mucus section when stamp is %s', (stamp) => {
    renderPage({ stamp });
    expect(screen.getByText('Tipo de muco')).toBeTruthy();
    expect(screen.getByTestId('mucus-none')).toBeTruthy();
    expect(screen.getByTestId('mucus-elastico')).toBeTruthy();
  });

  it('does NOT render the mucus section when stamp is sangramento', () => {
    renderPage({ stamp: 'sangramento' });
    expect(screen.queryByText('Tipo de muco')).toBeNull();
    expect(screen.queryByTestId('mucus-none')).toBeNull();
  });

  it('does NOT render the mucus section when no stamp is selected', () => {
    renderPage({ stamp: null });
    expect(screen.queryByText('Tipo de muco')).toBeNull();
  });

  it('"Sem muco" pill is pressed when form.mucus is null', () => {
    renderPage({ stamp: 'apice', mucus: null });
    expect(screen.getByTestId('mucus-none').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('mucus-elastico').getAttribute('aria-pressed')).toBe('false');
  });

  it('selecting a mucus quality with stamp apice sets form.mucus', () => {
    const { setForm } = renderPage({ stamp: 'apice', mucus: null });
    fireEvent.click(screen.getByTestId('mucus-elastico'));
    const updater = setForm.mock.calls[0][0];
    expect(updater(makeForm({ stamp: 'apice', mucus: null })).mucus).toBe('elastico');
  });

  it('clicking the active mucus quality toggles it back to null', () => {
    const { setForm } = renderPage({ stamp: 'apice', mucus: 'elastico' });
    fireEvent.click(screen.getByTestId('mucus-elastico'));
    const updater = setForm.mock.calls[0][0];
    expect(updater(makeForm({ stamp: 'apice', mucus: 'elastico' })).mucus).toBeNull();
  });

  it('clicking "Sem muco" clears form.mucus', () => {
    const { setForm } = renderPage({ stamp: 'muco', mucus: 'cremoso' });
    fireEvent.click(screen.getByTestId('mucus-none'));
    const updater = setForm.mock.calls[0][0];
    expect(updater(makeForm({ stamp: 'muco', mucus: 'cremoso' })).mucus).toBeNull();
  });

  it('onSave payload carries mucus when stamp is apice', () => {
    const { onSave } = renderPage({ stamp: 'apice', mucus: 'elastico' });
    fireEvent.click(screen.getByTestId('save-observation'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.stamp).toBe('apice');
    expect(payload.mucus).toBe('elastico');
  });
});

describe('HojePage — affirmative-only relations toggle', () => {
  it('shows the affirmative label when unchecked — never "não houve"', () => {
    const { container } = renderPage({ relations: false });
    expect(screen.getByText('Houve relação íntima hoje')).toBeTruthy();
    expect(container.textContent.toLowerCase()).not.toContain('não houve');
    expect(screen.getByTestId('toggle-relations').getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the same affirmative label when checked', () => {
    renderPage({ relations: true });
    expect(screen.getByText('Houve relação íntima hoje')).toBeTruthy();
    expect(screen.getByTestId('toggle-relations').getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking the toggle flips form.relations', () => {
    const { setForm } = renderPage({ relations: false });
    fireEvent.click(screen.getByTestId('toggle-relations'));
    const updater = setForm.mock.calls[0][0];
    expect(updater(makeForm({ relations: false })).relations).toBe(true);
  });

  it('does not render clinical classification labels (clinical constraint)', () => {
    const { container } = renderPage({ stamp: 'apice' });
    expect(container.textContent ?? '').not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });
});
