// @vitest-environment jsdom
/**
 * Modal unit tests
 *
 * AC: nothing renders when open=false.
 * AC: renders role=dialog with aria-modal and the title as accessible name.
 * AC: Escape closes; backdrop click closes; clicks inside do not close.
 * AC: focus moves into the dialog on open and returns to the opener on close.
 * AC: Tab is trapped inside the dialog.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { Modal } from '../Modal';

afterEach(cleanup);

function renderModal(open = true, onClose = vi.fn()) {
  const utils = render(
    <Modal open={open} onClose={onClose} title="Detalhes do dia" data-testid="day-modal">
      <button>primeiro</button>
      <button>último</button>
    </Modal>,
  );
  return { ...utils, onClose };
}

describe('Modal', () => {
  it('renders nothing when open=false', () => {
    renderModal(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders role=dialog with aria-modal and accessible title', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Detalhes do dia' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click but not on inner click', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText('primeiro'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('day-modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the dialog on open (first focusable = close button)', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'common.close' }),
    );
  });

  it('traps Tab at the boundaries', () => {
    renderModal();
    const buttons = screen.getAllByRole('button');
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // wrapped back to the first focusable (the close button in the header)
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('restores focus to the opener on close', () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button data-testid="opener" onClick={() => setOpen(true)}>
            abrir
          </button>
          <Modal open={open} onClose={() => setOpen(false)} title="T">
            <button>x</button>
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByTestId('opener');
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
