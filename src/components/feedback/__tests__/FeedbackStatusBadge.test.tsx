// @vitest-environment jsdom
/**
 * Tests for FeedbackStatusBadge component (billings-mob).
 *
 * Covers:
 *  - Renders correct label for each status
 *  - Accessible aria-label present
 *  - Clinical constraint: never displays fertile/infertile
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FeedbackStatusBadge } from '../FeedbackStatusBadge';
import type { FeedbackStatus } from '../../../types/feedback';

afterEach(() => cleanup());

const STATUS_LABELS: Array<[FeedbackStatus, string]> = [
  ['pending_triage',   'Em análise'],
  ['triaged',          'Aguardando aprovação'],
  ['pending_approval', 'Aguardando aprovação'],
  ['approved',         'Aprovado'],
  ['implementing',     'Aprovado'],
  ['deployed',         'Em validação'],
  ['final_approved',   'Implementado'],
  ['rejected',         'Rejeitado'],
];

describe('FeedbackStatusBadge', () => {
  it.each(STATUS_LABELS)(
    'renders correct label for status "%s"',
    (status, expectedLabel) => {
      render(<FeedbackStatusBadge status={status} />);
      expect(screen.getByText(expectedLabel)).toBeDefined();
    },
  );

  it('has accessible aria-label containing status description', () => {
    render(<FeedbackStatusBadge status="final_approved" />);
    // Use getAllByLabelText because each test re-uses the same DOM env
    const badges = screen.getAllByLabelText(/Status:/);
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0].getAttribute('aria-label')).toContain('Status:');
  });

  it('clinical constraint: never renders fertile/infertile classification', () => {
    const forbidden = ['fértil', 'infértil', 'seguro', 'inseguro', 'fertile', 'infertile'];
    render(
      <div>
        {STATUS_LABELS.map(([s]) => (
          <FeedbackStatusBadge key={s} status={s} />
        ))}
      </div>,
    );
    const bodyText = document.body.textContent ?? '';
    forbidden.forEach((word) => {
      expect(bodyText.toLowerCase()).not.toContain(word);
    });
  });
});
