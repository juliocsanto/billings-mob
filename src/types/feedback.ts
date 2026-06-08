/**
 * feedback.ts — tipos compartilhados do sistema de feedback comunitário.
 *
 * Restrição clínica: este arquivo NUNCA contém termos de classificação de ciclo.
 * LGPD: o campo `relations` nunca aparece nos tipos de feedback.
 */

export type FeedbackCategory = 'bug' | 'feature' | 'improvement';

export type FeedbackStatus =
  | 'pending_triage'
  | 'triaged'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'implementing'
  | 'deployed'
  | 'final_approved';

export interface FeedbackItem {
  id: string;
  author_id: string;
  author_role: 'student' | 'instructor';
  category: FeedbackCategory;
  title: string;
  content: string;
  status: FeedbackStatus;
  triage_type?: 'billings_method' | 'app_functionality';
  triage_result?: {
    impact: string;
    perceived_value: string;
    roadmap: string;
    agents: string;
    skills: string;
    costs: string;
    summary: string;
  };
  rejection_reason?: string;
  approval_note?: string;
  discount_applied: boolean;
  comment_count?: number;
  created_at: string;
}

export interface FeedbackComment {
  id: string;
  feedback_id: string;
  author_id: string;
  author_role: 'student' | 'instructor';
  content: string;
  created_at: string;
}
