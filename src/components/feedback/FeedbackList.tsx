/**
 * FeedbackList — lista principal de itens de feedback com filtros e paginação.
 *
 * - Botão flutuante "Nova sugestão" que abre NewFeedbackModal
 * - Filtros por categoria (tabs)
 * - Lista de FeedbackCard com botão "Carregar mais"
 * - Loading skeleton quando carregando
 * - Estado vazio quando não há feedback
 *
 * Restrição clínica: NUNCA exibe termos de classificação de ciclo.
 * LGPD: o campo `relations` nunca aparece aqui.
 * Usa inline styles (billings-mob não tem Tailwind).
 */

import { useState } from 'react';
import type { FeedbackCategory } from '../../types/feedback';
import { useListFeedback } from '../../hooks/useFeedback';
import { FeedbackCard } from './FeedbackCard';
import { NewFeedbackModal } from './NewFeedbackModal';
import { DS } from '../../constants.js';

interface Props {
  token: string;
  onSelectFeedback: (id: string) => void;
}

const PAGE_SIZE = 10;

type CategoryFilter = FeedbackCategory | 'all';

const FILTER_TABS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'bug', label: 'Erros' },
  { value: 'feature', label: 'Funcionalidades' },
  { value: 'improvement', label: 'Melhorias' },
];

function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      style={{
        background: DS.surface,
        border: `1px solid ${DS.border}`,
        borderRadius: DS.radiusCard,
        padding: '14px 16px',
        marginBottom: 10,
        boxShadow: DS.shadowCard,
      }}
    >
      <div
        style={{
          width: 80,
          height: 18,
          background: DS.border,
          borderRadius: 4,
          marginBottom: 10,
        }}
      />
      <div
        style={{
          width: '70%',
          height: 16,
          background: DS.border,
          borderRadius: 4,
          marginBottom: 8,
        }}
      />
      <div
        style={{
          width: '40%',
          height: 12,
          background: DS.border,
          borderRadius: 4,
        }}
      />
    </div>
  );
}

export function FeedbackList({ token, onSelectFeedback }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { items, loading, error, refresh } = useListFeedback(
    token,
    categoryFilter !== 'all' ? { category: categoryFilter } : undefined,
  );

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = items.length > visibleCount;

  const handleLoadMore = () => setVisibleCount((c) => c + PAGE_SIZE);

  const handleSuccess = () => {
    setVisibleCount(PAGE_SIZE);
    refresh();
  };

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div
        style={{
          padding: '20px 22px 16px',
          background: DS.surface,
          borderBottom: `1px solid ${DS.border}`,
        }}
      >
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 24,
            color: DS.textMain,
            fontStyle: 'italic',
            marginBottom: 4,
          }}
        >
          Sugestões da comunidade
        </div>
        <div style={{ fontSize: 12, color: DS.textSec }}>
          Compartilhe ideias e acompanhe melhorias no aplicativo
        </div>
      </div>

      {/* Category filter tabs */}
      <div
        role="tablist"
        aria-label="Filtrar por categoria"
        style={{
          display: 'flex',
          overflowX: 'auto',
          borderBottom: `1px solid ${DS.border}`,
          background: DS.surface,
          padding: '0 16px',
        }}
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            data-testid={`filter-tab-${tab.value}`}
            aria-selected={categoryFilter === tab.value}
            onClick={() => { setCategoryFilter(tab.value); setVisibleCount(PAGE_SIZE); }}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${categoryFilter === tab.value ? DS.primary : 'transparent'}`,
              padding: '10px 12px',
              fontSize: 12,
              fontWeight: categoryFilter === tab.value ? 700 : 400,
              color: categoryFilter === tab.value ? DS.primary : DS.textSec,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '16px 22px 0' }}>
        {/* Error state */}
        {error && (
          <div
            role="alert"
            style={{
              background: DS.errorLight,
              border: `1px solid ${DS.errorBorder}`,
              borderRadius: DS.radiusCard,
              padding: '12px 16px',
              color: DS.error,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            Erro ao carregar sugestões: {error}
            <button
              onClick={refresh}
              style={{
                marginLeft: 8,
                background: 'none',
                border: 'none',
                color: DS.primary,
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'inherit',
                textDecoration: 'underline',
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && items.length === 0 && (
          <div role="status" aria-label="Carregando sugestões...">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && items.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 0',
              color: DS.textSec,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 10 }}>○</div>
            <div
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 16,
                marginBottom: 6,
              }}
            >
              Nenhuma sugestão ainda
            </div>
            <div style={{ fontSize: 13 }}>
              {categoryFilter !== 'all'
                ? 'Nenhuma sugestão nesta categoria. Tente outro filtro.'
                : 'Seja a primeira a enviar uma sugestão!'}
            </div>
          </div>
        )}

        {/* Feedback cards */}
        {visibleItems.map((item) => (
          <FeedbackCard
            key={item.id}
            item={item}
            onSelect={onSelectFeedback}
          />
        ))}

        {/* Load more */}
        {hasMore && !loading && (
          <button
            data-testid="load-more-btn"
            onClick={handleLoadMore}
            aria-label="Carregar mais sugestões"
            style={{
              width: '100%',
              background: 'transparent',
              color: DS.primary,
              border: `1px solid ${DS.primaryBorder}`,
              borderRadius: DS.radiusBtn,
              padding: '12px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              marginTop: 8,
            }}
          >
            Carregar mais ({items.length - visibleCount} restantes)
          </button>
        )}
      </div>

      {/* FAB — Nova sugestão */}
      <button
        data-testid="new-feedback-fab"
        onClick={() => setShowNewModal(true)}
        aria-label="Criar nova sugestão"
        style={{
          position: 'fixed',
          bottom: 90,
          right: 22,
          background: DS.primary,
          color: DS.surface,
          border: 'none',
          borderRadius: DS.radiusBtn,
          padding: '12px 20px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'Lato, sans-serif',
          boxShadow: DS.shadowFAB,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 30,
          transition: 'transform 0.15s',
        }}
      >
        + Nova sugestão
      </button>

      {/* New feedback modal */}
      {showNewModal && (
        <NewFeedbackModal
          token={token}
          onClose={() => setShowNewModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
