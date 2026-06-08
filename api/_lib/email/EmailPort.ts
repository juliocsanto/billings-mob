/**
 * Email hexagonal port — ADR-019
 *
 * Defines the outbound port (interface) that application-layer code
 * (NotificationService, feedback endpoints) depends on. No adapter details leak here.
 *
 * LGPD (Art. 7, 11): email bodies must NEVER contain clinical data
 * (stamps, cycle details, relations, notes, or any fertile/infertile classification).
 * That responsibility belongs exclusively to the caller and to the templates.
 *
 * Pattern: identical to WhatsAppPort (ADR-011) — hexagonal outbound port.
 */

/** A transactional email message. */
export interface EmailMessage {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /**
   * HTML body of the email.
   * NEVER include clinical data (stamps, relations, notes, cycle classifications).
   * LGPD Art. 11: health data must not transit through external processors
   * without specific legal basis — transactional email does not qualify.
   */
  html: string;
  /** Plain text fallback for clients without HTML support */
  text?: string;
}

/** Result returned by every sendEmail() implementation. */
export interface EmailSendResult {
  success: boolean;
  /** Present when success=true; opaque provider-side identifier */
  messageId?: string;
  /** Present when success=false; human-readable error description */
  error?: string;
}

/**
 * Hexagonal outbound port.
 * Application code depends only on this interface — never on a concrete adapter.
 * Same pattern as WhatsAppPort (ADR-011).
 */
export interface EmailPort {
  sendEmail(message: EmailMessage): Promise<EmailSendResult>;
  isAvailable(): boolean;
}
