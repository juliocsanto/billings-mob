/**
 * Resend Email Adapter — ADR-019
 *
 * Production implementation using Resend REST API.
 * https://resend.com/docs/api-reference/emails/send-email
 *
 * Env vars required:
 *   RESEND_API_KEY — Bearer token from Resend dashboard
 *   EMAIL_FROM     — Verified sender address (default: noreply@billings.app)
 *
 * LGPD (Art. 7, 11): This adapter NEVER constructs email content — it only
 * serialises whatever message it receives. The caller (templates) is responsible
 * for ensuring no clinical data (stamps, relations, notes, cycle data) is present.
 *
 * PCI-DSS: No payment data transits through this adapter.
 * Security: RESEND_API_KEY is read from env — never hardcoded, never logged.
 */

import type { EmailPort, EmailMessage, EmailSendResult } from './EmailPort';

const RESEND_API_URL = 'https://api.resend.com/emails';

export class ResendEmailAdapter implements EmailPort {
  isAvailable(): boolean {
    return !!process.env['RESEND_API_KEY'];
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    const apiKey = process.env['RESEND_API_KEY'];
    if (!apiKey) {
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const from =
      process.env['EMAIL_FROM'] ?? 'Billings Grafico <noreply@billings.app>';

    const body: Record<string, unknown> = {
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
    };

    if (message.text) {
      body['text'] = message.text;
    }

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => `http_${response.status}`);
      console.warn('[ResendEmailAdapter] sendEmail failed:', response.status);
      return { success: false, error };
    }

    const data = await response.json() as { id?: string };
    return { success: true, messageId: data.id };
  }
}
