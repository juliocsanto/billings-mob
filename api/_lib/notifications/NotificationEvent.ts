/**
 * NotificationEvent — ADR-012
 *
 * Typed event contract for the NotificationService.
 *
 * LGPD / Clinical constraint:
 * - metadata deliberately excludes all clinical fields: stamp, mucus, bleeding,
 *   relations, notes, cycle data, and any fertile/infertile classification.
 * - TypeScript strict mode enforces this at compile time — adding any clinical
 *   field to NotificationEventMetadata is a type error.
 */

export type NotificationEventType =
  | 'new_observation'         // student registered an observation → notify instructor
  | 'conflict_detected'       // version conflict detected → notify instructor
  | 'link_request'            // student requested link → notify instructor
  | 'link_accepted'           // instructor accepted link → notify student
  | 'feedback_triaged'        // feedback triaged by AI → notify admin (ADR-018)
  | 'feedback_deployed'       // admin marks deployed → notify admin to final-approve (ADR-018)
  | 'user_feedback_implemented'; // final_approved → notify feedback author (ADR-018)

/**
 * Safe metadata — generic identifiers only.
 * NO clinical fields (stamp, mucus, bleeding, relations, notes, cycle).
 * Attempting to add stamp/relations/notes here is a compile-time error.
 */
export interface NotificationEventMetadata {
  /** Generic student display name — never clinical classifications */
  studentName?: string;
  /** ISO date string (YYYY-MM-DD) — never a cycle stamp or phase label */
  date?: string;

  // ── Feedback notification metadata (ADR-018) ───────────────────────────
  // Safe: feedback content is public community data, not clinical data.
  // LGPD: title/content of feedback is not health data (Art. 11 — not applicable here).

  /** Feedback post title — non-clinical public content */
  feedbackTitle?: string;
  /** Triage result summary — non-clinical metadata */
  triageSummary?: string;
  /** Triage impact level: low | medium | high | critical */
  triageImpact?: string;
  /** Discount percent applied to the feedback author */
  discountPercent?: number;
  /** URL for the admin panel to review/approve the feedback */
  adminPanelUrl?: string;
  /** User display name for notification recipient */
  userName?: string;
}

export interface NotificationEvent {
  type: NotificationEventType;
  /** auth.users.id of the recipient */
  recipientId: string;
  /** ID of the related entity (observation, link, etc.) */
  entityId: string;
  metadata: NotificationEventMetadata;
}
