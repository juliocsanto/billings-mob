/**
 * Email adapter barrel export — ADR-019
 *
 * Re-exports the port, adapters, and factory from a single entry point.
 * Import paths for application code:
 *   import { getEmailAdapter } from '../_lib/email';
 *   import type { EmailPort, EmailMessage } from '../_lib/email';
 */

export type { EmailPort, EmailMessage, EmailSendResult } from './EmailPort';
export { MockEmailAdapter } from './MockEmailAdapter';
export { ResendEmailAdapter } from './ResendEmailAdapter';
export { getEmailAdapter } from './emailFactory';
