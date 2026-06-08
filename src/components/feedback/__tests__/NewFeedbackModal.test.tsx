// @vitest-environment jsdom
/**
 * Tests for NewFeedbackModal component (billings-mob).
 *
 * Covers:
 *  - Renders all form fields
 *  - Shows validation errors when submitting empty form
 *  - Shows character counter for content
 *  - Accessible: aria-modal, aria-labelledby, close button
 *  - Calls onClose on close button click
 *  - data-testid attributes present on key elements
 *  - Clinical constraint: no forbidden terms in labels/placeholders
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NewFeedbackModal } from '../NewFeedbackModal';

afterEach(() => cleanup());

vi.mock('../../../constants.js', () => ({
  DS: {
    surface: '#FFFFFF',
    bg: '#F7F8FA',
    border: '#E5E7EB',
    radiusCard: 8,
    radiusInput: 8,
    radiusBtn: 24,
    shadowModal: '0 4px 24px rgba(26,43,74,0.18)',
    textMain: '#1A2B4A',
    textSec: '#6B7280',
    primary: '#37517E',
    error: '#EF4444',
    errorBorder: '#FCA5A5',
    errorLight: '#FEE2E2',
    warning: '#F59E0B',
  },
}));

vi.mock('../../../lib/feedbackApi', () => ({
  createFeedback: vi.fn().mockResolvedValue({ data: { id: 'new-id' } }),
}));

describe('NewFeedbackModal', () => {
  it('renders the modal with correct heading', () => {
    render(
      <NewFeedbackModal token="tok" onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Nova sugestão')).toBeDefined();
  });

  it('has aria-modal attribute', () => {
    render(
      <NewFeedbackModal token="tok" onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <NewFeedbackModal token="tok" onClose={onClose} onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('close-new-feedback-modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows validation errors when submitting empty form', () => {
    render(
      <NewFeedbackModal token="tok" onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('submit-feedback-btn'));
    // At least one validation error should appear
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('renders category select with options', () => {
    render(
      <NewFeedbackModal token="tok" onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(screen.getByTestId('feedback-category-select')).toBeDefined();
    expect(screen.getByText('Erro no aplicativo')).toBeDefined();
    expect(screen.getByText('Nova funcionalidade')).toBeDefined();
    expect(screen.getByText('Melhoria existente')).toBeDefined();
  });

  it('shows character counter for content', () => {
    render(
      <NewFeedbackModal token="tok" onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText('0/2000')).toBeDefined();
  });

  it('updates counter when typing in content', () => {
    render(
      <NewFeedbackModal token="tok" onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    const textarea = screen.getByTestId('feedback-content-textarea');
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    expect(screen.getByText('11/2000')).toBeDefined();
  });

  it('clinical constraint: no forbidden terms in visible labels/placeholders', () => {
    render(
      <NewFeedbackModal token="tok" onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    const bodyText = document.body.textContent ?? '';
    const html = document.body.innerHTML;
    ['fértil', 'infértil', 'seguro', 'inseguro', 'fertile', 'infertile'].forEach((word) => {
      expect(bodyText.toLowerCase()).not.toContain(word);
      expect(html.toLowerCase()).not.toContain(word);
    });
  });
});
