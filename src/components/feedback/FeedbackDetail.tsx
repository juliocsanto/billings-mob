/**
 * FeedbackDetail — exibição completa de um item de feedback.
 *
 * Mostra: título, categoria, status, conteúdo completo, CommentThread.
 * Se status=final_approved: exibe mensagem de implementação.
 * Se status=rejected e rejection_reason: exibe motivo.
 *
 * Restrição clínica: NUNCA exibe termos de classificação de ciclo.
 * LGPD: o campo `relations` nunca aparece aqui.
 * Usa inline styles (billings-mob não tem Tailwind).
 */

import { useState } from 'react';
import type { FeedbackCategory } from '../../types/feedback';
import { FeedbackStatusBadge } from './FeedbackStatusBadge';
import { CommentThread } from './CommentThread';
import { useFeedbackDetail } from '../../hooks/useFeedback';
import { addComment } from '../../lib/feedbackApi';
import { DS } from '../../constants.js';

interface Props {
  feedbackId: string;
  token: string;
  onBack: () => void;
}

const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: 'Erro',
  feature: 'Nova funcionalidade',
  improvement: 'Melhoria',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function FeedbackDetail({ feedbackId, token, onBack }: Props) {
  const { feedback, comments, loading, error, refresh } = useFeedbackDetail(token, feedbackId);
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const handleAddComment = async (content: string) => {
    setSubmitting(true);
    setCommentError(null);
    try {
      await addComment(token, feedbackId, content);
      refresh();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Erro ao enviar comentário.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Back button */}
      <div
        style={{
          padding: '16px 22px 0',
          position: 'sticky',
          top: 0,
          background: DS.bg,
          zIndex: 10,
          borderBottom: `1px solid ${DS.border}`,
          paddingBottom: 12,
        }}
      >
        <button
          data-testid="feedback-back-btn"
          onClick={onBack}
          aria-label="Voltar para lista de sugestões"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: DS.primary,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ← Voltar
        </button>
      </div>

      <div style={{ padding: '20px 22px' }}>
        {loading && (
          <div
            role="status"
            aria-live="polite"
            style={{ textAlign: 'center', color: DS.textSec, fontSize: 13 }}
          >
            Carregando...
          </div>
        )}

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
            }}
          >
            Erro ao carregar: {error}
          </div>
        )}

        {!loading && !error && feedback && (
          <>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: DS.primary,
                    background: DS.primaryLight,
                    border: `1px solid ${DS.primaryBorder}`,
                    borderRadius: 4,
                    padding: '2px 8px',
                  }}
                >
                  {CATEGORY_LABEL[feedback.category]}
                </span>
                <FeedbackStatusBadge status={feedback.status} />
              </div>

              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: DS.textMain,
                  margin: '0 0 6px',
                  lineHeight: 1.3,
                  fontFamily: 'Cormorant Garamond, serif',
                }}
              >
                {feedback.title}
              </h1>

              <div style={{ fontSize: 12, color: DS.textSec }}>
                {formatDate(feedback.created_at)}
              </div>
            </div>

            {/* Implementation success banner */}
            {feedback.status === 'final_approved' && (
              <div
                role="status"
                style={{
                  background: DS.successLight,
                  border: `1px solid ${DS.successBorder}`,
                  borderRadius: DS.radiusCard,
                  padding: '12px 16px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ color: DS.success, fontSize: 16 }}>✓</span>
                <span style={{ fontSize: 13, color: DS.success, fontWeight: 600 }}>
                  Esta sugestão foi implementada!
                </span>
              </div>
            )}

            {/* Rejection reason */}
            {feedback.status === 'rejected' && feedback.rejection_reason && (
              <div
                role="note"
                style={{
                  background: DS.errorLight,
                  border: `1px solid ${DS.errorBorder}`,
                  borderRadius: DS.radiusCard,
                  padding: '12px 16px',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: DS.error,
                    marginBottom: 4,
                  }}
                >
                  Motivo da rejeição
                </div>
                <p style={{ margin: 0, fontSize: 13, color: DS.textMain, lineHeight: 1.6 }}>
                  {feedback.rejection_reason}
                </p>
              </div>
            )}

            {/* Content */}
            <div
              style={{
                background: DS.surface,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radiusCard,
                padding: '16px',
                marginBottom: 24,
                boxShadow: DS.shadowCard,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  color: DS.textMain,
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {feedback.content}
              </p>
            </div>

            {/* Comment error */}
            {commentError && (
              <p role="alert" style={{ fontSize: 12, color: DS.error, marginBottom: 8 }}>
                {commentError}
              </p>
            )}

            {/* Comments */}
            <CommentThread
              comments={comments}
              submitting={submitting}
              onAddComment={handleAddComment}
            />
          </>
        )}
      </div>
    </div>
  );
}
