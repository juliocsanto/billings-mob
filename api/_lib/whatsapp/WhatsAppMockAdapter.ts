/**
 * WhatsApp Mock Adapter — ADR-011
 *
 * Used in development and test environments. Sends no real messages;
 * instead, stores them in an in-memory inbox for test assertions.
 *
 * NEVER reads production environment variables (WHATSAPP_API_TOKEN, etc.).
 * NEVER sends HTTP requests to any external service.
 *
 * LGPD: this adapter logs only the recipient number and body as provided
 * by the caller. It is the caller's responsibility (NotificationService)
 * to ensure no clinical data is present in the body.
 */

import { randomUUID } from 'node:crypto';
import type { WhatsAppMessage, WhatsAppPort, WhatsAppSendResult } from './WhatsAppPort';

export class WhatsAppMockAdapter implements WhatsAppPort {
  private inbox: WhatsAppMessage[] = [];

  async sendMessage(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    // Log to console so developers can observe messages during local dev
    console.warn(`[WhatsApp Mock] TO: ${message.to} | ${message.body}`);

    // Store a shallow copy so later inbox mutations don't affect stored entries
    this.inbox.push({ ...message });

    return {
      success: true,
      messageId: `mock-${randomUUID()}`,
    };
  }

  isAvailable(): boolean {
    return true;
  }

  /** Returns a copy of all messages sent since last clearInbox(). */
  getInbox(): WhatsAppMessage[] {
    return [...this.inbox];
  }

  /** Removes all messages from the in-memory inbox. */
  clearInbox(): void {
    this.inbox = [];
  }
}
