/**
 * Email Mock Adapter — ADR-019
 *
 * Used in development and test environments. Sends no real emails;
 * instead, stores them in an in-memory inbox for test assertions
 * and logs the subject to console so developers can inspect output.
 *
 * NEVER reads production environment variables (RESEND_API_KEY, etc.).
 * NEVER sends HTTP requests to any external service.
 *
 * LGPD: this adapter logs only the recipient and subject as provided
 * by the caller. It is the caller's responsibility (templates) to ensure
 * no clinical data is present in any message field.
 *
 * Pattern: identical to WhatsAppMockAdapter (ADR-011).
 */

import { randomUUID } from 'node:crypto';
import type { EmailPort, EmailMessage, EmailSendResult } from './EmailPort';

export class MockEmailAdapter implements EmailPort {
  private inbox: EmailMessage[] = [];

  isAvailable(): boolean {
    return true;
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    // Log to console — only subject and recipient (never the HTML body — may be large)
    console.warn(
      `[MockEmailAdapter] TO: ${message.to} | SUBJECT: ${message.subject}`,
    );

    // Store a shallow copy so later inbox mutations do not affect stored entries
    this.inbox.push({ ...message });

    return {
      success: true,
      messageId: `mock-email-${randomUUID()}`,
    };
  }

  /** Returns a deep copy of all messages sent since last clearInbox(). */
  getInbox(): EmailMessage[] {
    return this.inbox.map((msg) => ({ ...msg }));
  }

  /** Removes all messages from the in-memory inbox. */
  clearInbox(): void {
    this.inbox = [];
  }
}
