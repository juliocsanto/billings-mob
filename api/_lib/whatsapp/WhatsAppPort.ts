/**
 * WhatsApp hexagonal port — ADR-011
 *
 * Defines the outbound port (interface) that application-layer code
 * (NotificationService, etc.) depends on. No adapter details leak here.
 *
 * LGPD: message bodies must NEVER contain clinical data (stamps, cycle
 * details, fertile/infertile classifications). That responsibility belongs
 * exclusively to the caller (NotificationService).
 */

/** A plain text message to be sent via WhatsApp. */
export interface WhatsAppMessage {
  /** Recipient phone number in E.164 format, e.g. +5511987654321 */
  to: string;
  /** Plain text body — used by MockAdapter for logging; NO clinical data (LGPD constraint) */
  body: string;
  /** Whether WhatsApp should generate a link preview (optional) */
  previewUrl?: boolean;
  /** Name of the approved Meta template to use (CloudAdapter). When present, type=template is sent. */
  templateName?: string;
  /** Positional parameters {{1}}, {{2}}, etc. for the template body component. */
  templateParams?: string[];
}

/** Result returned by every sendMessage() implementation. */
export interface WhatsAppSendResult {
  success: boolean;
  /** Present when success=true; opaque identifier for the sent message */
  messageId?: string;
  /** Present when success=false; human-readable error description */
  error?: string;
}

/**
 * Hexagonal outbound port.
 * Application code depends only on this interface — never on a concrete adapter.
 */
export interface WhatsAppPort {
  sendMessage(message: WhatsAppMessage): Promise<WhatsAppSendResult>;
  isAvailable(): boolean;
}
