// @vitest-environment jsdom
/**
 * Tests for FeedbackStatusBadge component (billings-mob).
 *
 * Covers:
 *  - Renders correct label for each status (via i18n keys)
 *  - Accessible aria-label present
 *  - Clinical constraint: never displays fertile/infertile
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FeedbackStatusBadge } from '../FeedbackStatusBadge';
import type { FeedbackStatus } from '../../../types/feedback';

afterEach(() => cleanup());

// ── Mock react-i18next so components render with pt-BR values ─────────────────
vi.mock('react-i18next', () => {
  const keys: Record<string, string> = {
    'feedback.statusPendingTriage':   'Em análise',
    'feedback.statusTriaged':         'Aguardando aprovação',
    'feedback.statusPendingApproval': 'Aguardando aprovação',
    'feedback.statusApproved':        'Aprovado',
    'feedback.statusImplementing':    'Aprovado',
    'feedback.statusDeployed':        'Em validação',
    'feedback.statusFinalApproved':   'Implementado',
    'feedback.statusRejected':        'Rejeitado',
    'feedback.statusAriaLabel':       'Status: {{label}}',
  };
  return {
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        let val = keys[key] ?? key;
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            val = val.replace(`{{${k}}}`, String(v));
          });
        }
        return val;
      },
      i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
    }),
  };
});

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
