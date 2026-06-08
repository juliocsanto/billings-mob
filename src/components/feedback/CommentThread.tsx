/**
 * CommentThread — lista de comentários + textarea para novo comentário.
 *
 * Mostra: author_role e data de cada comentário.
 * Textarea + botão "Comentar" que chama onAddComment.
 *
 * Restrição clínica: NUNCA exibe termos de classificação de ciclo.
 * LGPD: o campo `relations` nunca aparece aqui.
 * Usa inline styles (billings-mob não tem Tailwind).
 */

import { useState } from 'react';
import type { FeedbackComment } from '../../types/feedback';
import { DS } from '../../constants.js';

interface Props {
  comments: FeedbackComment[];
  submitting: boolean;
  onAddComment: (content: string) => Promise<void>;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const ROLE_LABEL: Record<string, string> = {
  student:    'Aluna',
  instructor: 'Instrutora',
};

export function CommentThread({ comments, submitting, onAddComment }: Props) {
  const [content, setContent] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setLocalError('O comentário não pode estar vazio.');
      return;
    }
    setLocalError(null);
    await onAddComment(trimmed);
    setContent('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      void handleSubmit();
    }
  };

  return (
    <section aria-label="Comentários">
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: DS.textSec,
          marginBottom: 12,
        }}
      >
        Comentários {comments.length > 0 && `(${comments.length})`}
      </div>

      {/* Comment list */}
      {comments.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            color: DS.textSec,
            fontSize: 13,
            fontStyle: 'italic',
            padding: '16px 0',
          }}
        >
          Nenhum comentário ainda. Seja a primeira a comentar!
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {comments.map((c) => (
            <div
              key={c.id}
              style={{
                background: DS.bg,
                border: `1px solid ${DS.border}`,
                borderRadius: DS.radiusCard,
                padding: '10px 14px',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: DS.primary,
                  }}
                >
                  {ROLE_LABEL[c.author_role] ?? c.author_role}
                </span>
                <span style={{ fontSize: 11, color: DS.textSec }}>
                  {formatDate(c.created_at)}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: DS.textMain,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {c.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* New comment form */}
      <div>
        <label
          htmlFor="new-comment-input"
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: DS.textSec,
            marginBottom: 6,
          }}
        >
          Adicionar comentário
        </label>
        <textarea
          id="new-comment-input"
          data-testid="comment-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escreva seu comentário... (Ctrl+Enter para enviar)"
          aria-label="Novo comentário"
          rows={3}
          style={{
            width: '100%',
            background: DS.bg,
            border: `1px solid ${localError ? DS.error : DS.border}`,
            borderRadius: DS.radiusInput,
            padding: '10px 12px',
            fontSize: 13,
            color: DS.textMain,
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            lineHeight: 1.6,
            marginBottom: 6,
          }}
        />
        {localError && (
          <p role="alert" style={{ fontSize: 12, color: DS.error, margin: '0 0 6px' }}>
            {localError}
          </p>
        )}
        <button
          data-testid="submit-comment-btn"
          onClick={() => void handleSubmit()}
          disabled={submitting || !content.trim()}
          aria-label="Enviar comentário"
          style={{
            background: content.trim() && !submitting ? DS.primary : DS.border,
            color: content.trim() && !submitting ? DS.surface : DS.textSec,
            border: 'none',
            borderRadius: DS.radiusBtn,
            padding: '10px 22px',
            fontSize: 13,
            fontWeight: 700,
            cursor: content.trim() && !submitting ? 'pointer' : 'default',
            fontFamily: 'inherit',
            transition: 'background 0.15s',
          }}
        >
          {submitting ? 'Enviando...' : 'Comentar'}
        </button>
      </div>
    </section>
  );
}
