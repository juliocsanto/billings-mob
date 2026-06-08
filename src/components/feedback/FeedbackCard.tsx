/**
 * FeedbackCard — card resumido de um item de feedback.
 *
 * Mostra: título, categoria (badge), status (FeedbackStatusBadge), data, contagem de comentários.
 * Ao clicar chama onSelect(item.id).
 *
 * Restrição clínica: NUNCA exibe termos de classificação de ciclo.
 * LGPD: o campo `relations` nunca aparece aqui.
 * Usa inline styles (billings-mob não tem Tailwind).
 */

import type { FeedbackCategory, FeedbackItem } from '../../types/feedback';
import { FeedbackStatusBadge } from './FeedbackStatusBadge';
import { DS } from '../../constants.js';

interface Props {
  item: FeedbackItem;
  onSelect: (id: string) => void;
}

const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: 'Erro',
  feature: 'Nova funcionalidade',
  improvement: 'Melhoria',
};

const CATEGORY_COLOR: Record<FeedbackCategory, { color: string; bg: string; border: string }> = {
  bug:         { color: '#991B1B', bg: '#FEE2E2', border: '#FCA5A5' },
  feature:     { color: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' },
  improvement: { color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function FeedbackCard({ item, onSelect }: Props) {
  const catStyle = CATEGORY_COLOR[item.category] ?? CATEGORY_COLOR.improvement;

  const handleClick = () => onSelect(item.id);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(item.id);
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      data-testid={`feedback-card-${item.id}`}
      aria-label={`Feedback: ${item.title}. Status: ${item.status}. Clique para ver detalhes.`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        background: DS.surface,
        border: `1px solid ${DS.border}`,
        borderRadius: DS.radiusCard,
        padding: '14px 16px',
        marginBottom: 10,
        cursor: 'pointer',
        boxShadow: DS.shadowCard,
        transition: 'box-shadow 0.15s',
        outline: 'none',
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 2px ${DS.primary}`;
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = DS.shadowCard;
      }}
    >
      {/* Badges row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <span
          data-testid="feedback-category-badge"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: catStyle.color,
            background: catStyle.bg,
            border: `1px solid ${catStyle.border}`,
            borderRadius: 4,
            padding: '2px 8px',
          }}
        >
          {CATEGORY_LABEL[item.category]}
        </span>
        <FeedbackStatusBadge status={item.status} />
      </div>

      {/* Title */}
      <div
        data-testid="feedback-card-title"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: DS.textMain,
          marginBottom: 6,
          lineHeight: 1.4,
        }}
      >
        {item.title}
      </div>

      {/* Footer: date + comments */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: DS.textSec,
        }}
      >
        <span>{formatDate(item.created_at)}</span>
        {item.comment_count !== null && item.comment_count !== undefined && item.comment_count > 0 && (
          <span aria-label={`${item.comment_count} comentário${item.comment_count !== 1 ? 's' : ''}`}>
            💬 {item.comment_count}
          </span>
        )}
      </div>
    </article>
  );
}
