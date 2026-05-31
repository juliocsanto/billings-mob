// TODO: implementar após aprovação Meta Business (ADR-011)
/**
 * WhatsApp Cloud API Adapter — ADR-011
 *
 * STUB — not yet implemented.
 * All calls return a failure result until Meta Business approval is obtained
 * and the full implementation is completed.
 *
 * See ADR-011 for the integration plan and prerequisites.
 */

import type { WhatsAppMessage, WhatsAppPort, WhatsAppSendResult } from './WhatsAppPort';

export class WhatsAppCloudAdapter implements WhatsAppPort {
  async sendMessage(_message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    console.warn(
      '[WhatsApp Cloud] WARNING: WhatsAppCloudAdapter is not implemented. ' +
      'Meta Business approval is pending (ADR-011). Message was NOT sent.'
    );

    return {
      success: false,
      error: 'not_implemented: Meta approval pending',
    };
  }

  isAvailable(): boolean {
    return false;
  }
}
