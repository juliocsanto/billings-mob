// @vitest-environment jsdom
/**
 * Tests for FeedbackCard component (billings-mob).
 *
 * Covers:
 *  - Renders title, category badge, status badge, date
 *  - Calls onSelect with correct id on click
 *  - Calls onSelect with correct id on Enter key
 *  - Shows comment count when > 0
 *  - data-testid attribute present
 *  - Clinical constraint: never displays fertile/infertile
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FeedbackCard } from '../FeedbackCard';
import type { FeedbackItem } from '../../../types/feedback';

afterEach(() => cleanup());

const MOCK_ITEM: FeedbackItem = {
  id: 'abc-123',
  author_id: 'user-1',
  author_role: 'student',
  category: 'feature',
  title: 'Adicionar modo escuro',
  content: 'Seria ótimo ter um modo escuro no aplicativo.',
  status: 'pending_triage',
  discount_applied: false,
  comment_count: 3,
  created_at: '2026-06-01T10:00:00Z',
};

// Mock constants.js (no actual Tailwind/DS in jsdom)
vi.mock('../../../constants.js', () => ({
  DS: {
    surface: '#FFFFFF',
    border: '#E5E7EB',
    radiusCard: 8,
    shadowCard: '0 1px 3px rgba(0,0,0,0.08)',
    textMain: '#1A2B4A',
    textSec: '#6B7280',
    primary: '#37517E',
    primaryLight: '#EBF0F8',
    primaryBorder: '#C7D4EC',
  },
}));

describe('FeedbackCard', () => {
  it('renders the feedback title via data-testid', () => {
    const onSelect = vi.fn();
    render(<FeedbackCard item={MOCK_ITEM} onSelect={onSelect} />);
    const titleEl = screen.getByTestId('feedback-card-title');
    expect(titleEl).toBeDefined();
    expect(titleEl.textContent).toBe('Adicionar modo escuro');
  });

  it('renders a category badge via data-testid', () => {
    const onSelect = vi.fn();
    render(<FeedbackCard item={MOCK_ITEM} onSelect={onSelect} />);
    const badge = screen.getByTestId('feedback-category-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe('Nova funcionalidade');
  });

  it('renders the status badge via data-testid', () => {
    const onSelect = vi.fn();
    render(<FeedbackCard item={MOCK_ITEM} onSelect={onSelect} />);
    const statusBadge = screen.getByTestId('feedback-status-badge');
    expect(statusBadge).toBeDefined();
    expect(statusBadge.textContent).toBe('Em análise');
  });

  it('shows comment count aria-label when > 0', () => {
    const onSelect = vi.fn();
    render(<FeedbackCard item={MOCK_ITEM} onSelect={onSelect} />);
    const el = screen.getByLabelText(/3 comentários/i);
    expect(el).toBeDefined();
  });

  it('calls onSelect with item id on click', () => {
    const onSelect = vi.fn();
    render(<FeedbackCard item={MOCK_ITEM} onSelect={onSelect} />);
    const card = screen.getByTestId('feedback-card-abc-123');
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledWith('abc-123');
  });

  it('calls onSelect on Enter key press', () => {
    const onSelect = vi.fn();
    render(<FeedbackCard item={MOCK_ITEM} onSelect={onSelect} />);
    const card = screen.getByTestId('feedback-card-abc-123');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('abc-123');
  });

  it('calls onSelect on Space key press', () => {
    const onSelect = vi.fn();
    render(<FeedbackCard item={MOCK_ITEM} onSelect={onSelect} />);
    const card = screen.getByTestId('feedback-card-abc-123');
    fireEvent.keyDown(card, { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith('abc-123');
  });

  it('has data-testid attribute', () => {
    const onSelect = vi.fn();
    render(<FeedbackCard item={MOCK_ITEM} onSelect={onSelect} />);
    expect(screen.getByTestId('feedback-card-abc-123')).toBeDefined();
  });

  it('does not show comment count when 0', () => {
    const onSelect = vi.fn();
    const item = { ...MOCK_ITEM, comment_count: 0 };
    render(<FeedbackCard item={item} onSelect={onSelect} />);
    expect(screen.queryByLabelText(/comentário/i)).toBeNull();
  });

  it('clinical constraint: never renders fertile/infertile classification', () => {
    const onSelect = vi.fn();
    render(<FeedbackCard item={MOCK_ITEM} onSelect={onSelect} />);
    const bodyText = document.body.textContent ?? '';
    ['fértil', 'infértil', 'seguro', 'inseguro'].forEach((word) => {
      expect(bodyText.toLowerCase()).not.toContain(word);
    });
  });
});
