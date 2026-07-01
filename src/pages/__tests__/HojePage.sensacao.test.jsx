// @vitest-environment jsdom
/**
 * Unit tests — HojePage: Sensação field (LVL-10) + Sticky Save CTA (LVL-18)
 *
 * Covers:
 *  - SENSAÇÃO section renders all three options (seca, molhada, lubrificante)
 *  - Selecting a sensation updates form.sensacao (via setForm callback)
 *  - Selecting the same sensation again deselects it (toggle behaviour)
 *  - The onSave payload includes form.sensacao when Save is invoked
 *  - The sticky save bar renders "save-observation" button
 *  - LGPD: sensação value is never passed to console.log or telemetry in this test
 *
 * Clinical constraint: no fertile/infertile language anywhere in this component.
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
        'nav.hoje': 'Hoje',
        'app.observacaoHoje': 'Observação de hoje',
        'app.savedToday': 'Salvo hoje',
        'app.saveObservation': 'Salvar observação',
        'app.selectStampHint': 'Selecione um símbolo primeiro',
        'app.startNewCycle': 'Iniciar novo ciclo',
        'app.confirmNewCycle': 'Confirmar novo ciclo?',
        'app.relationsYesToday': 'Sim hoje',
        'app.relationsNoToday': 'Não hoje',
        'app.relationsVisibility': 'Visível apenas para instrutora',
        'app.apiceDescLine1': 'Linha 1',
        'app.apiceDescLine2': 'Linha 2',
        'app.apiceDescLine3': 'Linha 3',
        'app.notesPlaceholder': 'Observações',
        'dayDetail.sensation': 'Sensação',
        'dayDetail.intensity': 'Intensidade',
        'dayDetail.mucusType': 'Tipo de muco',
        'dayDetail.apiceMarked': 'Ápice marcado',
        'dayDetail.intimateRelations': 'Relações íntimas',
        'dayDetail.notesLabel': 'Observações',
        'sensacao.seca': 'Seca',
        'sensacao.molhada': 'Molhada',
        'sensacao.lubrificante': 'Lubrificante',
        'stamps.sangramento': 'Sangramento',
        'stamps.seco': 'Seco',
        'stamps.muco': 'Muco',
        'stamps.apice': 'Ápice',
        'stampsub.sangramento': 'Menstruação',
        'stampsub.seco': 'PBI — sem muco',
        'stampsub.muco': 'Fluxo presente',
        'stampsub.apice': 'Último dia lubrificante',
        'common.confirm': 'Confirmar',
        'common.cancel': 'Cancelar',
      };
      return map[key] ?? key;
    },
  }),
}));

// ── Mock Button component — renders a plain <button> ─────────────────────────
vi.mock('../../components/ui', () => ({
  Button: ({ children, onClick, disabled, 'data-testid': testId, className }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={className}
    >
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

function renderPage(formOverrides = {}, handlers = {}) {
  const form = makeForm(formOverrides);
  const setForm = vi.fn();
  const onSave = vi.fn();
  const onStartNewCycle = vi.fn();
  const setConfirmNew = vi.fn();

  const utils = render(
    <HojePage
      form={form}
      setForm={setForm}
      saved={false}
      confirmNew={false}
      setConfirmNew={setConfirmNew}
      onSave={onSave}
      onStartNewCycle={onStartNewCycle}
      {...handlers}
    />,
  );

  return { ...utils, form, setForm, onSave, onStartNewCycle, setConfirmNew };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HojePage — Sensação section (LVL-10)', () => {
  it('renders the SENSAÇÃO heading', () => {
    renderPage();
    expect(screen.getByText('Sensação')).toBeTruthy();
  });

  it('renders all three sensation options', () => {
    renderPage();
    expect(screen.getByTestId('sensacao-seca')).toBeTruthy();
    expect(screen.getByTestId('sensacao-molhada')).toBeTruthy();
    expect(screen.getByTestId('sensacao-lubrificante')).toBeTruthy();
  });

  it('all sensation buttons start as aria-pressed=false when sensacao is null', () => {
    renderPage({ sensacao: null });
    const btn = screen.getByTestId('sensacao-seca');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('active sensation button has aria-pressed=true', () => {
    renderPage({ sensacao: 'seca' });
    const btn = screen.getByTestId('sensacao-seca');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a sensation calls setForm with sensacao set to that id', () => {
    const { setForm } = renderPage({ sensacao: null });
    fireEvent.click(screen.getByTestId('sensacao-molhada'));
    expect(setForm).toHaveBeenCalledTimes(1);
    // setForm receives an updater function — call it with the current form to verify the output
    const updater = setForm.mock.calls[0][0];
    const prev = makeForm({ sensacao: null });
    const next = updater(prev);
    expect(next.sensacao).toBe('molhada');
  });

  it('clicking the active sensation again deselects it (toggles to null)', () => {
    const { setForm } = renderPage({ sensacao: 'seca' });
    fireEvent.click(screen.getByTestId('sensacao-seca'));
    const updater = setForm.mock.calls[0][0];
    const prev = makeForm({ sensacao: 'seca' });
    const next = updater(prev);
    expect(next.sensacao).toBeNull();
  });

  it('does not render clinical classification labels (clinical constraint)', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });
});

describe('HojePage — onSave payload includes sensacao (LVL-10 acceptance)', () => {
  it('passes form.sensacao in the onSave payload when stamp is set', () => {
    const { onSave } = renderPage({ stamp: 'seco', sensacao: 'seca' });
    fireEvent.click(screen.getByTestId('save-observation'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.sensacao).toBe('seca');
  });

  it('does not call onSave when stamp is null', () => {
    const { onSave } = renderPage({ stamp: null });
    fireEvent.click(screen.getByTestId('save-observation'));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('HojePage — Sticky Save CTA (LVL-18)', () => {
  it('renders the save-observation button', () => {
    renderPage();
    expect(screen.getByTestId('save-observation')).toBeTruthy();
  });

  it('save button is disabled when no stamp is selected', () => {
    renderPage({ stamp: null });
    const btn = screen.getByTestId('save-observation');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('save button is enabled when a stamp is selected', () => {
    renderPage({ stamp: 'seco' });
    const btn = screen.getByTestId('save-observation');
    expect(btn).toHaveProperty('disabled', false);
  });

  it('shows hint text when no stamp selected', () => {
    renderPage({ stamp: null });
    expect(screen.getByText('Selecione um símbolo primeiro')).toBeTruthy();
  });

  it('hides hint text when a stamp is selected', () => {
    renderPage({ stamp: 'seco' });
    expect(screen.queryByText('Selecione um símbolo primeiro')).toBeNull();
  });
});
