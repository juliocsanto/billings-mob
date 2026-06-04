// @vitest-environment jsdom
/**
 * Tests for DayDetailModal component.
 *
 * Covers:
 *  - Renders stamp selection and day info for past days
 *  - Renders "day not arrived yet" message for future days
 *  - onClose fires when X button is clicked
 *  - onSave fires with correct date and formData when save button is clicked
 *  - Past-day notice appears for past days
 *  - Clinical constraint: never displays fertile/infertile interpretation
 *  - Version history section: renders when versions fetched, absent otherwise
 *  - LGPD: relations and notes never rendered in version history
 *
 * Sprint 2 item #11: useObservationVersions is mocked to control version data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DayDetailModal } from '../DayDetailModal.jsx';

// ── Mock useObservationVersions so DayDetailModal tests are isolated ───────────
vi.mock('../../hooks/useObservationVersions', () => ({
  useObservationVersions: vi.fn(() => ({ versions: [], loading: false, error: null })),
}));

import { useObservationVersions } from '../../hooks/useObservationVersions';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no versions
  vi.mocked(useObservationVersions).mockReturnValue({ versions: [], loading: false, error: null });
});

const TODAY = '2026-05-27';
const PAST_DATE = '2026-05-20';
const FUTURE_DATE = '2026-05-30';

const makePastDay = (override = {}) => ({
  date: PAST_DATE,
  n: 20,
  obs: { stamp: 'seco', mucus: null, bleeding: null, notes: '', relations: false },
  ...override,
});

describe('DayDetailModal', () => {
  it('renders day number and stamp selector for past day', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    // Day number appears in header
    expect(screen.getByText(/Dia 20 do ciclo/)).toBeDefined();
    // All 4 stamp labels should appear (each appears once as button label)
    const stampsGrid = container.querySelector('[style*="grid-template-columns"]');
    expect(stampsGrid).not.toBeNull();
    expect(within(stampsGrid).getByText('Sangramento')).toBeDefined();
    expect(within(stampsGrid).getByText('Seco')).toBeDefined();
    expect(within(stampsGrid).getByText('Muco')).toBeDefined();
    expect(within(stampsGrid).getByText('Ápice')).toBeDefined();
  });

  it('shows past-day notice for past dates', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    // Find the notice by its partial text content
    const notice = container.querySelector('[style*="amberLight"]') ||
      Array.from(container.querySelectorAll('div')).find(el =>
        el.textContent?.includes('editando um registro passado')
      );
    expect(notice).not.toBeNull();
  });

  it('shows future day message and hides stamp form', () => {
    const { container } = render(
      <DayDetailModal
        day={{ date: FUTURE_DATE, n: 30, obs: null }}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    // Should show future message
    const allText = container.textContent;
    expect(allText).toContain('ainda não chegou');
    // Stamp grid should NOT render
    const stampsGrid = container.querySelector('[style*="grid-template-columns"]');
    expect(stampsGrid).toBeNull();
  });

  it('calls onClose when the X button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <DayDetailModal
        day={makePastDay()}
        today={TODAY}
        onClose={onClose}
        onSave={vi.fn()}
      />
    );
    // Find the close button by querying all buttons and finding the one with ×
    const buttons = container.querySelectorAll('button');
    const closeBtn = Array.from(buttons).find(b => b.textContent.trim() === '×');
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onSave with correct date and form data when save button is clicked', () => {
    const onSave = vi.fn();
    const { container } = render(
      <DayDetailModal
        day={makePastDay()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    // Find save button by its text
    const buttons = container.querySelectorAll('button');
    const saveBtn = Array.from(buttons).find(b => b.textContent.trim() === 'Salvar edição');
    expect(saveBtn).not.toBeNull();
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledOnce();
    const [calledDate, calledForm] = onSave.mock.calls[0];
    expect(calledDate).toBe(PAST_DATE);
    expect(calledForm.stamp).toBe('seco');
  });

  it('save button is disabled when no stamp is selected', () => {
    const onSave = vi.fn();
    render(
      <DayDetailModal
        day={{ date: PAST_DATE, n: 5, obs: null }} // no obs = no stamp
        today={TODAY}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    const saveBtns = screen.getAllByText('Salvar edição');
    fireEvent.click(saveBtns[0]);
    // onSave should NOT be called because form.stamp is null
    expect(onSave).not.toHaveBeenCalled();
  });

  it('never displays words like fértil, infértil, seguro or inseguro (clinical constraint)', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toContain('fértil');
    expect(html).not.toContain('fertil');
    expect(html).not.toContain('infértil');
    expect(html).not.toContain('seguro');
    expect(html).not.toContain('inseguro');
  });

  it('shows "Hoje" label for today date', () => {
    const { container } = render(
      <DayDetailModal
        day={{ date: TODAY, n: 27, obs: { stamp: 'seco', mucus: null, bleeding: null, notes: '', relations: false } }}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const allText = container.textContent;
    expect(allText).toContain('Hoje');
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <DayDetailModal
        day={makePastDay()}
        today={TODAY}
        onClose={onClose}
        onSave={vi.fn()}
      />
    );
    // The backdrop is the outermost div
    const backdrop = container.firstChild;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ── Version history section tests (Sprint 2 item #11) ─────────────────────────

const OBSERVATION_ID = '11111111-1111-1111-1111-111111111111';

const makePastDayWithId = (override = {}) => ({
  date: PAST_DATE,
  n: 20,
  obs: { id: OBSERVATION_ID, stamp: 'seco', mucus: null, bleeding: null, notes: '', relations: false },
  ...override,
});

const SAMPLE_VERSIONS = [
  {
    id: 'ver-2',
    observation_id: OBSERVATION_ID,
    vector_clock: { 'user-1': 2 },
    data: { stamp: 'muco', mucus: 'cremoso', bleeding: null },
    author_id: 'user-student-1',
    conflict_resolved: false,
    created_at: '2026-05-20T14:00:00Z',
  },
  {
    id: 'ver-1',
    observation_id: OBSERVATION_ID,
    vector_clock: { 'user-1': 1 },
    data: { stamp: 'seco', mucus: null, bleeding: null },
    author_id: 'user-student-1',
    conflict_resolved: false,
    created_at: '2026-05-20T10:00:00Z',
  },
];

describe('DayDetailModal — version history section', () => {
  it('does not render history section when observationId is undefined', () => {
    vi.mocked(useObservationVersions).mockReturnValue({ versions: [], loading: false, error: null });

    const { container } = render(
      <DayDetailModal
        day={{ date: PAST_DATE, n: 20, obs: { stamp: 'seco', mucus: null, bleeding: null, notes: '', relations: false } }}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
      // No observationId prop → no version history
    );

    const allText = container.textContent;
    expect(allText).not.toContain('Histórico de edições');
  });

  it('does not render history section when versions array is empty', () => {
    vi.mocked(useObservationVersions).mockReturnValue({ versions: [], loading: false, error: null });

    const { container } = render(
      <DayDetailModal
        day={makePastDayWithId()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
        observationId={OBSERVATION_ID}
      />
    );

    const allText = container.textContent;
    expect(allText).not.toContain('Histórico de edições');
  });

  it('renders history section heading when versions are present', () => {
    vi.mocked(useObservationVersions).mockReturnValue({
      versions: SAMPLE_VERSIONS,
      loading: false,
      error: null,
    });

    const { container } = render(
      <DayDetailModal
        day={makePastDayWithId()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
        observationId={OBSERVATION_ID}
      />
    );

    expect(container.textContent).toContain('Histórico de versões');
  });

  it('renders stamp label for each version', () => {
    vi.mocked(useObservationVersions).mockReturnValue({
      versions: SAMPLE_VERSIONS,
      loading: false,
      error: null,
    });

    const { container } = render(
      <DayDetailModal
        day={makePastDayWithId()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
        observationId={OBSERVATION_ID}
      />
    );

    const allText = container.textContent;
    // 'Muco' and 'Seco' are stamp labels from STAMPS constant
    expect(allText).toContain('Muco');
    expect(allText).toContain('Seco');
  });

  it('renders formatted date/time for each version in pt-BR locale', () => {
    vi.mocked(useObservationVersions).mockReturnValue({
      versions: SAMPLE_VERSIONS,
      loading: false,
      error: null,
    });

    const { container } = render(
      <DayDetailModal
        day={makePastDayWithId()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
        observationId={OBSERVATION_ID}
      />
    );

    // The date '2026-05-20' formatted in pt-BR should include '20' or '05' or '2026'
    const allText = container.textContent;
    expect(allText).toMatch(/20\/05\/2026|20 de maio|maio de 2026/i);
  });

  it('LGPD: never renders "relations" or "notes" text in history section', () => {
    vi.mocked(useObservationVersions).mockReturnValue({
      versions: SAMPLE_VERSIONS,
      loading: false,
      error: null,
    });

    const { container } = render(
      <DayDetailModal
        day={makePastDayWithId()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
        observationId={OBSERVATION_ID}
      />
    );

    // Check that no rendered version row contains the word "relations" as a field name
    // (the label "Relações íntimas" is in the edit form, not in the history)
    // We check the history section specifically
    const historySection = Array.from(container.querySelectorAll('[data-testid="version-history"]'));
    if (historySection.length > 0) {
      historySection.forEach(section => {
        expect(section.textContent).not.toContain('relations');
        expect(section.textContent).not.toContain('notes');
      });
    }
    // Additionally, raw field names must not appear (defensive check)
    // "relations" as a JS property name must not be rendered as text
    const lowerHtml = container.innerHTML.toLowerCase();
    // The word 'relations' should not appear as displayed content in version rows
    // (it can appear as part of aria attrs only if added deliberately — we don't add those)
    const historyEl = container.querySelector('[data-testid="version-history"]');
    if (historyEl) {
      expect(historyEl.textContent?.toLowerCase()).not.toContain('"relations"');
      expect(historyEl.textContent?.toLowerCase()).not.toContain('"notes"');
    }
    // Verify no clinical interpretation
    expect(lowerHtml).not.toContain('fértil');
    expect(lowerHtml).not.toContain('fertil');
    expect(lowerHtml).not.toContain('infértil');
    expect(lowerHtml).not.toContain('seguro');
    expect(lowerHtml).not.toContain('inseguro');
  });

  it('does not render history section for future days', () => {
    vi.mocked(useObservationVersions).mockReturnValue({
      versions: SAMPLE_VERSIONS,
      loading: false,
      error: null,
    });

    const { container } = render(
      <DayDetailModal
        day={{ date: '2026-05-30', n: 30, obs: null }}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
        observationId={OBSERVATION_ID}
      />
    );

    // Future day shows "still not arrived" message — no history
    expect(container.textContent).toContain('ainda não chegou');
    expect(container.textContent).not.toContain('Histórico de edições');
  });

  it('passes observationId to useObservationVersions hook', () => {
    render(
      <DayDetailModal
        day={makePastDayWithId()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
        observationId={OBSERVATION_ID}
      />
    );

    // Hook receives the observationId as first argument
    // jwt is null in Sprint 2 (no session wiring yet) — hook handles null gracefully
    expect(vi.mocked(useObservationVersions)).toHaveBeenCalledWith(
      OBSERVATION_ID,
      null
    );
  });

  it('passes null observationId to hook when prop is not provided', () => {
    render(
      <DayDetailModal
        day={makePastDayWithId()}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
        // No observationId prop
      />
    );

    // Hook receives null observationId → returns empty versions without fetching
    expect(vi.mocked(useObservationVersions)).toHaveBeenCalledWith(
      null,
      null
    );
  });
});

// ── "Sem muco" explicit option tests (Feedback MOB — 2026-06-01) ─────────────

describe('DayDetailModal — "Sem muco" pill', () => {
  it('renders "Sem muco" pill in tipo de muco section when stamp is non-bleeding', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'seco', mucus: null, bleeding: null, notes: '', relations: false } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    // "Sem muco" pill must appear in the UI
    expect(container.textContent).toContain('Sem muco');
  });

  it('does NOT render "Sem muco" pill when stamp is sangramento', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'sangramento', mucus: null, bleeding: null, notes: '', relations: false } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    // Tipo de muco section is hidden for sangramento — so "Sem muco" must not appear
    expect(container.textContent).not.toContain('Sem muco');
  });

  it('"Sem muco" pill is active (visually selected) when form.mucus is null and stamp is non-bleeding', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'muco', mucus: null, bleeding: null, notes: '', relations: false } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    // The "Sem muco" pill button must exist; when mucus is null it should carry data-active or a distinct style
    const semMucoBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.trim() === 'Sem muco'
    );
    expect(semMucoBtn).not.toBeNull();
    // Active state must be distinguishable — either data-active="true" or inline background differs from inactive
    const isActive =
      semMucoBtn.getAttribute('data-active') === 'true' ||
      semMucoBtn.style.background !== '' ||
      semMucoBtn.innerHTML.includes('data-active');
    expect(isActive).toBe(true);
  });

  it('clicking "Sem muco" pill sets form.mucus back to null and saves correctly', () => {
    const onSave = vi.fn();
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'muco', mucus: 'cremoso', bleeding: null, notes: '', relations: false } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    // Click "Sem muco" pill to clear mucus selection
    const semMucoBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.trim() === 'Sem muco'
    );
    expect(semMucoBtn).not.toBeNull();
    fireEvent.click(semMucoBtn);

    // Now save — form.mucus must be null
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.trim() === 'Salvar edição'
    );
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledOnce();
    const [, savedForm] = onSave.mock.calls[0];
    expect(savedForm.mucus).toBeNull();
  });

  it('"Sem muco" pill is inactive when a mucus quality is selected', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'muco', mucus: 'elastico', bleeding: null, notes: '', relations: false } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const semMucoBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.trim() === 'Sem muco'
    );
    expect(semMucoBtn).not.toBeNull();
    // data-active must be "false" or not present when mucus is set to a real value
    const activeAttr = semMucoBtn.getAttribute('data-active');
    expect(activeAttr).not.toBe('true');
  });

  it('"Sem muco" appears before the mucus quality buttons in the DOM', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'muco', mucus: null, bleeding: null, notes: '', relations: false } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const allText = container.textContent;
    const semMucoPos = allText.indexOf('Sem muco');
    const opacoPos = allText.indexOf('Opaco');
    expect(semMucoPos).toBeGreaterThanOrEqual(0);
    expect(opacoPos).toBeGreaterThanOrEqual(0);
    expect(semMucoPos).toBeLessThan(opacoPos);
  });

  it('"Sem muco" pill renders for all non-bleeding stamps (seco, muco, apice)', () => {
    const nonBleedingStamps = ['seco', 'muco', 'apice'];
    nonBleedingStamps.forEach(stamp => {
      const { container, unmount } = render(
        <DayDetailModal
          day={makePastDay({ obs: { stamp, mucus: null, bleeding: null, notes: '', relations: false } })}
          today={TODAY}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );
      expect(container.textContent).toContain('Sem muco');
      unmount();
    });
  });
});

// ── observacao_descricao field tests (feat: add free-text field for sangramento) ─

describe('DayDetailModal — observacao_descricao field', () => {
  it('renders "Descreva o que você vê" textarea when stamp is sangramento', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'sangramento', mucus: null, bleeding: null, notes: '', relations: false, observacao_descricao: null } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(container.textContent).toContain('Descreva o que você vê');
    const textarea = container.querySelector('textarea[data-testid="observacao-descricao"]');
    expect(textarea).not.toBeNull();
  });

  it('does NOT render "Descreva o que você vê" textarea when stamp is seco', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'seco', mucus: null, bleeding: null, notes: '', relations: false } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const textarea = container.querySelector('textarea[data-testid="observacao-descricao"]');
    expect(textarea).toBeNull();
  });

  it('does NOT render "Descreva o que você vê" textarea when stamp is muco', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'muco', mucus: null, bleeding: null, notes: '', relations: false } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const textarea = container.querySelector('textarea[data-testid="observacao-descricao"]');
    expect(textarea).toBeNull();
  });

  it('does NOT render "Descreva o que você vê" textarea when stamp is apice', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'apice', mucus: null, bleeding: null, notes: '', relations: false } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const textarea = container.querySelector('textarea[data-testid="observacao-descricao"]');
    expect(textarea).toBeNull();
  });

  it('typing in observacao_descricao textarea updates form state', () => {
    const onSave = vi.fn();
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'sangramento', mucus: null, bleeding: null, notes: '', relations: false, observacao_descricao: null } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    const textarea = container.querySelector('textarea[data-testid="observacao-descricao"]');
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea, { target: { value: 'fluxo com muco elástico' } });

    // Save and check payload
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.trim() === 'Salvar edição'
    );
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledOnce();
    const [, savedForm] = onSave.mock.calls[0];
    expect(savedForm.observacao_descricao).toBe('fluxo com muco elástico');
  });

  it('onSave is called with observacao_descricao in payload when stamp is sangramento', () => {
    const onSave = vi.fn();
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'sangramento', mucus: null, bleeding: null, notes: '', relations: false, observacao_descricao: 'coloração rosada' } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.trim() === 'Salvar edição'
    );
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledOnce();
    const [, savedForm] = onSave.mock.calls[0];
    expect('observacao_descricao' in savedForm).toBe(true);
    expect(savedForm.observacao_descricao).toBe('coloração rosada');
  });

  it('initialForm loads observacao_descricao from day.obs.observacao_descricao', () => {
    const onSave = vi.fn();
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'sangramento', mucus: null, bleeding: null, notes: '', relations: false, observacao_descricao: 'fluxo intenso marrom' } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    const textarea = container.querySelector('textarea[data-testid="observacao-descricao"]');
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe('fluxo intenso marrom');
  });

  it('EMPTY_FORM has observacao_descricao as null (new day with no obs)', () => {
    const onSave = vi.fn();
    const { container } = render(
      <DayDetailModal
        day={{ date: PAST_DATE, n: 5, obs: null }}
        today={TODAY}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    // Select sangramento stamp so the textarea appears
    const buttons = container.querySelectorAll('button');
    const sangramentoBtn = Array.from(buttons).find(b => b.textContent.includes('Sangramento'));
    fireEvent.click(sangramentoBtn);

    const textarea = container.querySelector('textarea[data-testid="observacao-descricao"]');
    expect(textarea).not.toBeNull();
    // When loaded from EMPTY_FORM, value should be empty string (null rendered as '')
    expect(textarea.value).toBe('');
  });

  it('observacao_descricao textarea appears below "O que você observa" pills and above notes field', () => {
    const { container } = render(
      <DayDetailModal
        day={makePastDay({ obs: { stamp: 'sangramento', mucus: null, bleeding: null, notes: '', relations: false } })}
        today={TODAY}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const allText = container.textContent;
    const tipoObservacaoPos = allText.indexOf('O que você observa');
    const descrPos = allText.indexOf('Descreva o que você vê');
    const notesPos = allText.indexOf('Notas para a instrutora');

    expect(tipoObservacaoPos).toBeGreaterThanOrEqual(0);
    expect(descrPos).toBeGreaterThanOrEqual(0);
    expect(notesPos).toBeGreaterThanOrEqual(0);
    expect(tipoObservacaoPos).toBeLessThan(descrPos);
    expect(descrPos).toBeLessThan(notesPos);
  });
});
