/**
 * WhatsApp hexagonal module — public API barrel
 *
 * Consumers should import from this file, not from individual adapter files.
 * This keeps the hexagonal boundary clean: callers depend on the port type,
 * and the factory hides which concrete adapter is in use.
 *
 * Example:
 *   import { getWhatsAppAdapter } from '../_lib/whatsapp';
 *   import type { WhatsAppMessage } from '../_lib/whatsapp';
 */

export type { WhatsAppMessage, WhatsAppSendResult, WhatsAppPort } from './WhatsAppPort';
export { WhatsAppMockAdapter } from './WhatsAppMockAdapter';
export { WhatsAppCloudAdapter } from './WhatsAppCloudAdapter';
export { getWhatsAppAdapter } from './factory';
