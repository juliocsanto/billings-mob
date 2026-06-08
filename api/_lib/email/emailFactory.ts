/**
 * Email adapter factory — ADR-019
 *
 * Reads process.env.EMAIL_ENV to select the concrete adapter.
 * Accepted values:
 *   'mock'       → MockEmailAdapter  (default; safe for dev and CI)
 *   'production' → ResendEmailAdapter (requires RESEND_API_KEY)
 *
 * Any unknown value falls back to the mock adapter so tests and local dev
 * are never accidentally broken by a misconfigured environment variable.
 *
 * The factory maintains a singleton: the same instance is returned on every
 * call within the same Node.js module lifecycle. Vitest's vi.resetModules()
 * can clear this between tests that need a fresh instance.
 *
 * Pattern: identical to WhatsApp adapter factory (ADR-011).
 */

import type { EmailPort } from './EmailPort';
import { MockEmailAdapter } from './MockEmailAdapter';
import { ResendEmailAdapter } from './ResendEmailAdapter';

let instance: EmailPort | null = null;

export function getEmailAdapter(): EmailPort {
  if (instance !== null) {
    return instance;
  }

  const emailEnv = process.env['EMAIL_ENV'];

  if (emailEnv === 'production') {
    instance = new ResendEmailAdapter();
  } else {
    // Default: 'mock' or any unknown value — safe for dev and CI
    instance = new MockEmailAdapter();
  }

  return instance;
}
