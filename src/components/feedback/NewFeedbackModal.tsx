/**
 * NewFeedbackModal — modal de criação de novo feedback.
 *
 * - Select para category (bug, feature, improvement)
 * - Input para título (5-100 chars)
 * - Textarea para conteúdo (10-2000 chars com contador)
 * - Validação client-side antes de submeter
 * - Submit → POST createFeedback → fecha modal + refresh lista
 *
 * Restrição clínica: NUNCA exibe termos de classificação de ciclo.
 * Não usar termos: fértil, infértil, seguro, inseguro em labels, placeholders ou mensagens.
 * LGPD: o campo `relations` nunca aparece aqui.
 * Usa inline styles (billings-mob não tem Tailwind).
 */

import { useState, useEffect, useRef } from 'react';
import type { FeedbackCategory } from '../../types/feedback';
import { createFeedback } from '../../lib/feedbackApi';
import { DS } from '../../constants.js';

interface Props {
  token: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormErrors {
  category?: string;
  title?: string;
  content?: string;
}

const CATEGORY_OPTIONS: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'bug', label: 'Erro no aplicativo' },
  { value: 'feature', label: 'Nova funcionalidade' },
  { value: 'improvement', label: 'Melhoria existente' },
];

const CONTENT_MAX = 2000;
const TITLE_MIN = 5;
const TITLE_MAX = 100;
const CONTENT_MIN = 10;

export function NewFeedbackModal({ token, onClose, onSuccess }: Props) {
  const [category, setCategory] = useState<FeedbackCategory | ''>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLSelectElement>(null);

  // Focus trap and initial focus
  useEffect(() => {
    firstFocusRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, select, input, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!category) newErrors.category = 'Selecione uma categoria.';
    if (title.length < TITLE_MIN) newErrors.title = `O título deve ter pelo menos ${TITLE_MIN} caracteres.`;
    if (title.length > TITLE_MAX) newErrors.title = `O título pode ter no máximo ${TITLE_MAX} caracteres.`;
    if (content.length < CONTENT_MIN) newErrors.content = `Descreva com pelo menos ${CONTENT_MIN} caracteres.`;
    if (content.length > CONTENT_MAX) newErrors.content = `O conteúdo pode ter no máximo ${CONTENT_MAX} caracteres.`;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!category) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await createFeedback(token, { category, title: title.trim(), content: content.trim() });
      onSuccess();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao enviar sugestão.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    /* Backdrop */
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,43,74,0.45)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-feedback-title"
        style={{
          background: DS.surface,
          borderRadius: '20px 20px 0 0',
          padding: '24px 22px 40px',
          width: '100%',
          maxWidth: 430,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: DS.shadowModal,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2
            id="new-feedback-title"
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: DS.textMain,
              fontFamily: 'Cormorant Garamond, serif',
            }}
          >
            Nova sugestão
          </h2>
          <button
            data-testid="close-new-feedback-modal"
            onClick={onClose}
            aria-label="Fechar modal de nova sugestão"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              color: DS.textSec,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Category */}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="feedback-category"
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
            Categoria
          </label>
          <select
            id="feedback-category"
            ref={firstFocusRef}
            data-testid="feedback-category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedbackCategory | '')}
            aria-describedby={errors.category ? 'category-error' : undefined}
            style={{
              width: '100%',
              background: DS.bg,
              border: `1px solid ${errors.category ? DS.error : DS.border}`,
              borderRadius: DS.radiusInput,
              padding: '10px 12px',
              fontSize: 13,
              color: category ? DS.textMain : DS.textSec,
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Selecione uma categoria...</option>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.category && (
            <p id="category-error" role="alert" style={{ fontSize: 12, color: DS.error, margin: '4px 0 0' }}>
              {errors.category}
            </p>
          )}
        </div>

        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="feedback-title"
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
            Título
          </label>
          <input
            id="feedback-title"
            data-testid="feedback-title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Resumo breve da sua sugestão"
            aria-describedby={errors.title ? 'title-error' : undefined}
            maxLength={TITLE_MAX}
            style={{
              width: '100%',
              background: DS.bg,
              border: `1px solid ${errors.title ? DS.error : DS.border}`,
              borderRadius: DS.radiusInput,
              padding: '10px 12px',
              fontSize: 13,
              color: DS.textMain,
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 4,
            }}
          >
            {errors.title ? (
              <p id="title-error" role="alert" style={{ fontSize: 12, color: DS.error, margin: 0 }}>
                {errors.title}
              </p>
            ) : (
              <span />
            )}
            <span style={{ fontSize: 11, color: DS.textSec }}>
              {title.length}/{TITLE_MAX}
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="feedback-content"
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
            Descrição
          </label>
          <textarea
            id="feedback-content"
            data-testid="feedback-content-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Descreva sua sugestão com detalhes..."
            aria-describedby={errors.content ? 'content-error' : undefined}
            rows={5}
            maxLength={CONTENT_MAX}
            style={{
              width: '100%',
              background: DS.bg,
              border: `1px solid ${errors.content ? DS.error : DS.border}`,
              borderRadius: DS.radiusInput,
              padding: '10px 12px',
              fontSize: 13,
              color: DS.textMain,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              lineHeight: 1.6,
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 4,
            }}
          >
            {errors.content ? (
              <p id="content-error" role="alert" style={{ fontSize: 12, color: DS.error, margin: 0 }}>
                {errors.content}
              </p>
            ) : (
              <span />
            )}
            <span
              style={{
                fontSize: 11,
                color: content.length > CONTENT_MAX * 0.9 ? DS.warning : DS.textSec,
              }}
            >
              {content.length}/{CONTENT_MAX}
            </span>
          </div>
        </div>

        {/* Submit error */}
        {submitError && (
          <div
            role="alert"
            style={{
              background: DS.errorLight,
              border: `1px solid ${DS.errorBorder}`,
              borderRadius: DS.radiusCard,
              padding: '10px 14px',
              marginBottom: 14,
              fontSize: 13,
              color: DS.error,
            }}
          >
            {submitError}
          </div>
        )}

        {/* Submit */}
        <button
          data-testid="submit-feedback-btn"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          aria-label="Enviar sugestão"
          style={{
            width: '100%',
            background: submitting ? DS.border : DS.primary,
            color: submitting ? DS.textSec : DS.surface,
            border: 'none',
            borderRadius: DS.radiusBtn,
            padding: '14px',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: submitting ? 'default' : 'pointer',
            fontFamily: 'Lato, sans-serif',
            transition: 'background 0.15s',
          }}
        >
          {submitting ? 'Enviando...' : 'Enviar sugestão'}
        </button>
      </div>
    </div>
  );
}
