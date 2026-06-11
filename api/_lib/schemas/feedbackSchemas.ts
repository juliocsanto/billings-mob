/**
 * Zod schemas for feedback endpoints — ADR-018.
 *
 * Restrição clínica (inviolável):
 *   O conteúdo de feedback NUNCA deve conter classificações clínicas do ciclo.
 *   O schema rejeita via regex qualquer menção a termos proibidos antes de persistir.
 *
 * LGPD: feedback é dado público (não clínico). Não há restrição de transmissão.
 */

import { z } from 'zod';

// ── Regex para rejeitar termos clínicos proibidos (restrição inviolável) ──────
// Esses termos são de competência exclusiva da instrutora — NUNCA do sistema.
const CLINICAL_TERMS_PATTERN = /\b(fértil|infértil|fertil|infertil|seguro|inseguro)\b/i;

function noClinicalTerms(val: string): boolean {
  return !CLINICAL_TERMS_PATTERN.test(val);
}

const clinicalTermsError = {
  message:
    'Conteúdo não pode conter termos de interpretação clínica. Consulte sua instrutora para questões sobre o ciclo.',
};

// ── Category values ────────────────────────────────────────────────────────────
export const FEEDBACK_CATEGORIES = ['bug', 'feature', 'improvement'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

// ── Status values ─────────────────────────────────────────────────────────────
export const FEEDBACK_STATUSES = [
  'pending_triage',
  'pending_admin',
  'approved',
  'rejected',
  'implementing',
  'deployed',
  'final_approved',
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

// ── POST /api/feedback ────────────────────────────────────────────────────────

export const CreateFeedbackSchema = z
  .object({
    category: z.enum(FEEDBACK_CATEGORIES),
    title: z
      .string()
      .min(5, 'Título deve ter pelo menos 5 caracteres')
      .max(200, 'Título deve ter no máximo 200 caracteres')
      .refine(noClinicalTerms, clinicalTermsError),
    content: z
      .string()
      .min(10, 'Conteúdo deve ter pelo menos 10 caracteres')
      .max(2000, 'Conteúdo deve ter no máximo 2000 caracteres')
      .refine(noClinicalTerms, clinicalTermsError),
  })
  .strict();

export type CreateFeedbackInput = z.infer<typeof CreateFeedbackSchema>;

// ── GET /api/feedback (query params) ─────────────────────────────────────────

export const ListFeedbackQuerySchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  status: z.enum(FEEDBACK_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListFeedbackQuery = z.infer<typeof ListFeedbackQuerySchema>;

// ── POST /api/feedback/:id/comments ──────────────────────────────────────────

export const CreateCommentSchema = z
  .object({
    content: z
      .string()
      .min(1, 'Comentário não pode estar vazio')
      .max(1000, 'Comentário deve ter no máximo 1000 caracteres'),
  })
  .strict();

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

// ── PATCH /api/feedback/:id/approve ──────────────────────────────────────────

export const ApproveSchema = z
  .object({
    approvalNote: z.string().max(1000).optional(),
  })
  .strict();

export type ApproveInput = z.infer<typeof ApproveSchema>;

// ── PATCH /api/feedback/:id/reject ───────────────────────────────────────────

export const RejectSchema = z
  .object({
    reason: z.string().min(1, 'Motivo é obrigatório').max(1000),
  })
  .strict();

export type RejectInput = z.infer<typeof RejectSchema>;

// ── Column selection constants (LGPD: always explicit — never SELECT *) ───────

export const FEEDBACK_SELECT_COLUMNS =
  'id, author_id, author_role, category, title, content, status, triage_type, triage_result, triage_at, rejection_reason, approved_at, approved_by, approval_note, final_approved_at, final_approved_by, discount_applied, created_at, updated_at' as const;

export const FEEDBACK_PUBLIC_SELECT_COLUMNS =
  'id, author_id, author_role, category, title, content, status, triage_type, triage_at, rejection_reason, approved_at, discount_applied, created_at, updated_at' as const;

export const COMMENT_SELECT_COLUMNS =
  'id, feedback_id, author_id, author_role, content, created_at, updated_at' as const;
