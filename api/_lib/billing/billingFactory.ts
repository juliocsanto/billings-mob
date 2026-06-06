/**
 * Asaas billing adapter factory — ADR-015
 *
 * Reads process.env.ASAAS_ENV to select the concrete adapter.
 * Accepted values:
 *   'production' → AsaasCloudAdapter (real Asaas REST API v3)
 *   any other    → MockAsaasAdapter (default; safe for dev and CI)
 *
 * Any unknown value falls back to the mock adapter so tests and local dev
 * are never accidentally broken by a misconfigured environment variable.
 *
 * Pattern mirrors the WhatsApp factory (ADR-011) for architectural consistency.
 */

import type { AsaasPort } from './AsaasPort';
import { MockAsaasAdapter } from './MockAsaasAdapter';
import { AsaasCloudAdapter } from './AsaasCloudAdapter';

/**
 * Returns the appropriate Asaas adapter based on ASAAS_ENV.
 * Called once per request (serverless — no module-level singleton needed).
 */
export function getBillingAdapter(): AsaasPort {
  return process.env.ASAAS_ENV === 'production'
    ? new AsaasCloudAdapter()
    : new MockAsaasAdapter();
}
