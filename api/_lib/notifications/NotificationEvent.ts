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
  | 'new_observation'    // student registered an observation → notify instructor
  | 'conflict_detected'  // version conflict detected → notify instructor
  | 'link_request'       // student requested link → notify instructor
  | 'link_accepted';     // instructor accepted link → notify student

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
}

export interface NotificationEvent {
  type: NotificationEventType;
  /** auth.users.id of the recipient */
  recipientId: string;
  /** ID of the related entity (observation, link, etc.) */
  entityId: string;
  metadata: NotificationEventMetadata;
}
