/**
 * FeedbackStatusBadge — badge colorido por status de feedback.
 *
 * Restrição clínica: NUNCA exibe termos de classificação de ciclo.
 * Usa inline styles (billings-mob não tem Tailwind).
 */

import type { FeedbackStatus } from '../../types/feedback';

interface Props {
  status: FeedbackStatus;
}

interface BadgeStyle {
  label: string;
  color: string;
  background: string;
  border: string;
}

const BADGE_MAP: Record<FeedbackStatus, BadgeStyle> = {
  pending_triage: {
    label: 'Em análise',
    color: '#374151',
    background: '#F3F4F6',
    border: '#D1D5DB',
  },
  triaged: {
    label: 'Aguardando aprovação',
    color: '#92400E',
    background: '#FEF3C7',
    border: '#FCD34D',
  },
  pending_approval: {
    label: 'Aguardando aprovação',
    color: '#92400E',
    background: '#FEF3C7',
    border: '#FCD34D',
  },
  approved: {
    label: 'Aprovado',
    color: '#1D4ED8',
    background: '#DBEAFE',
    border: '#93C5FD',
  },
  implementing: {
    label: 'Aprovado',
    color: '#1D4ED8',
    background: '#DBEAFE',
    border: '#93C5FD',
  },
  deployed: {
    label: 'Em validação',
    color: '#92400E',
    background: '#FED7AA',
    border: '#FDBA74',
  },
  final_approved: {
    label: 'Implementado',
    color: '#065F46',
    background: '#D1FAE5',
    border: '#6EE7B7',
  },
  rejected: {
    label: 'Rejeitado',
    color: '#991B1B',
    background: '#FEE2E2',
    border: '#FCA5A5',
  },
};

export function FeedbackStatusBadge({ status }: Props) {
  const badge = BADGE_MAP[status] ?? BADGE_MAP.pending_triage;

  return (
    <span
      data-testid="feedback-status-badge"
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        color: badge.color,
        background: badge.background,
        border: `1px solid ${badge.border}`,
        borderRadius: 4,
        padding: '2px 8px',
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
      }}
      aria-label={`Status: ${badge.label}`}
    >
      {badge.label}
    </span>
  );
}
