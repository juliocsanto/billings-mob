/**
 * WhatsApp Cloud API Adapter — ADR-011
 *
 * Production implementation using Meta Graph API v19.0.
 * Sends template messages when templateName is provided;
 * falls back to type=text for testing purposes when no template is given.
 *
 * Env vars required:
 *   WHATSAPP_PHONE_NUMBER_ID — Phone Number ID from Meta Business dashboard
 *   WHATSAPP_ACCESS_TOKEN    — System user or app access token
 *
 * LGPD: This adapter NEVER constructs message text — it only serialises
 * whatever body/templateParams it receives. The caller (NotificationService
 * via buildPayload/buildWhatsAppTemplate) is responsible for clinical safety.
 */

import type { WhatsAppMessage, WhatsAppPort, WhatsAppSendResult } from './WhatsAppPort';

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

export class WhatsAppCloudAdapter implements WhatsAppPort {
  isAvailable(): boolean {
    return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
  }

  async sendMessage(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      return { success: false, error: 'missing_credentials' };
    }

    const requestBody = message.templateName
      ? this._buildTemplateBody(message, message.templateName, message.templateParams ?? [])
      : this._buildTextBody(message);

    const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({})) as { error?: { message?: string } };
      const errMsg = errData?.error?.message ?? `http_${res.status}`;
      console.warn('[WhatsAppCloud] sendMessage failed:', res.status, errMsg);
      return { success: false, error: errMsg };
    }

    const data = await res.json() as { messages?: Array<{ id: string }> };
    return { success: true, messageId: data.messages?.[0]?.id };
  }

  private _buildTemplateBody(
    message: WhatsAppMessage,
    templateName: string,
    params: string[],
  ): object {
    return {
      messaging_product: 'whatsapp',
      to: message.to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'pt_BR' },
        components: params.length
          ? [
              {
                type: 'body',
                parameters: params.map((p) => ({ type: 'text', text: p })),
              },
            ]
          : [],
      },
    };
  }

  private _buildTextBody(message: WhatsAppMessage): object {
    return {
      messaging_product: 'whatsapp',
      to: message.to,
      type: 'text',
      text: { body: message.body },
    };
  }
}
