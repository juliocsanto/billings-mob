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
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DayDetailModal } from '../DayDetailModal.jsx';

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
