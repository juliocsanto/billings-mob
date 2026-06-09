/**
 * FeedbackStatusBadge — badge colorido por status de feedback.
 *
 * Restrição clínica: NUNCA exibe termos de classificação de ciclo.
 * Usa inline styles (billings-mob não tem Tailwind).
 * ADR-014: strings via useTranslation — namespace 'feedback'.
 */

import { useTranslation } from 'react-i18next';
import type { FeedbackStatus } from '../../types/feedback';

interface Props {
  status: FeedbackStatus;
}

interface BadgeStyle {
  color: string;
  background: string;
  border: string;
}

const BADGE_STYLE: Record<FeedbackStatus, BadgeStyle> = {
  pending_triage: {
    color: '#374151',
    background: '#F3F4F6',
    border: '#D1D5DB',
  },
  triaged: {
    color: '#92400E',
    background: '#FEF3C7',
    border: '#FCD34D',
  },
  pending_approval: {
    color: '#92400E',
    background: '#FEF3C7',
    border: '#FCD34D',
  },
  approved: {
    color: '#1D4ED8',
    background: '#DBEAFE',
    border: '#93C5FD',
  },
  implementing: {
    color: '#1D4ED8',
    background: '#DBEAFE',
    border: '#93C5FD',
  },
  deployed: {
    color: '#92400E',
    background: '#FED7AA',
    border: '#FDBA74',
  },
  final_approved: {
    color: '#065F46',
    background: '#D1FAE5',
    border: '#6EE7B7',
  },
  rejected: {
    color: '#991B1B',
    background: '#FEE2E2',
    border: '#FCA5A5',
  },
};

const STATUS_TO_KEY: Record<FeedbackStatus, string> = {
  pending_triage:   'feedback.statusPendingTriage',
  triaged:          'feedback.statusTriaged',
  pending_approval: 'feedback.statusPendingApproval',
  approved:         'feedback.statusApproved',
  implementing:     'feedback.statusImplementing',
  deployed:         'feedback.statusDeployed',
  final_approved:   'feedback.statusFinalApproved',
  rejected:         'feedback.statusRejected',
};

export function FeedbackStatusBadge({ status }: Props) {
  const { t } = useTranslation();

  const style = BADGE_STYLE[status] ?? BADGE_STYLE.pending_triage;
  const label = t(STATUS_TO_KEY[status] ?? 'feedback.statusPendingTriage');

  return (
    <span
      data-testid="feedback-status-badge"
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        color: style.color,
        background: style.background,
        border: `1px solid ${style.border}`,
        borderRadius: 4,
        padding: '2px 8px',
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
      }}
      aria-label={t('feedback.statusAriaLabel', { label })}
    >
      {label}
    </span>
  );
}
