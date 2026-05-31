/**
 * WhatsApp adapter factory — ADR-011
 *
 * Reads process.env.WHATSAPP_ADAPTER to select the concrete adapter.
 * Accepted values:
 *   'mock'  → WhatsAppMockAdapter  (default; safe for dev and CI)
 *   'cloud' → WhatsAppCloudAdapter (stub until Meta approval)
 *
 * Any unknown value falls back to the mock adapter so tests and local dev
 * are never accidentally broken by a misconfigured environment variable.
 *
 * The factory maintains a singleton: the same instance is returned on every
 * call within the same Node.js module lifecycle. Vitest's vi.resetModules()
 * can clear this between tests that need a fresh instance.
 */

import type { WhatsAppPort } from './WhatsAppPort';
import { WhatsAppMockAdapter } from './WhatsAppMockAdapter';
import { WhatsAppCloudAdapter } from './WhatsAppCloudAdapter';

let instance: WhatsAppPort | null = null;

export function getWhatsAppAdapter(): WhatsAppPort {
  if (instance !== null) {
    return instance;
  }

  const adapterEnv = process.env['WHATSAPP_ADAPTER'];

  if (adapterEnv === 'cloud') {
    instance = new WhatsAppCloudAdapter();
  } else {
    // Default: 'mock' or any unknown value
    instance = new WhatsAppMockAdapter();
  }

  return instance;
}
