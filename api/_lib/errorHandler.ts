/**
 * Standardized error handler for Hono.js API routes.
 *
 * Returns consistent JSON error shapes across all endpoints:
 * {
 *   "error": "ErrorCode",
 *   "message": "Human-readable description"
 * }
 *
 * LGPD: Error messages must never reveal relations or notes field values.
 * The handler strips any error message that references sensitive fields.
 *
 * Observability (NC-02 ISO 27001): Unhandled 500 errors are captured in Sentry
 * with LGPD scrubbing applied before the event leaves the server.
 */
import type { Context } from 'hono';
import * as SentryNode from '@sentry/node';

export type ApiError = {
  error: string;
  message: string;
};

/**
 * LGPD Art. 11 — campos sensíveis que nunca devem aparecer em eventos Sentry.
 * NC-02 auditoria ISO 27001:2022 — critério de aceitação obrigatório.
 */
const API_LGPD_SENSITIVE_FIELDS = new Set([
  'relations',
  'notes',
  'observacao_descricao',
  'fcm_token',
  'password',
  'token',
]);

function redactLgpdFieldsFromObject(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(redactLgpdFieldsFromObject);
  }
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const isEmailField =
        typeof key === 'string' && key.toLowerCase().includes('email') && key !== 'error';
      if (API_LGPD_SENSITIVE_FIELDS.has(key) || isEmailField) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactLgpdFieldsFromObject(val);
      }
    }
    return out;
  }
  return obj;
}

/**
 * Sentry beforeSend for the API layer — prevents LGPD-sensitive fields
 * from being transmitted to sentry.io in any error event.
 */
function apiLgpdBeforeSend(
  event: SentryNode.ErrorEvent
): SentryNode.ErrorEvent | null {
  if (event.request?.data) {
    event.request.data = redactLgpdFieldsFromObject(event.request.data);
  }
  if (event.extra) {
    event.extra = redactLgpdFieldsFromObject(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = redactLgpdFieldsFromObject(event.contexts) as typeof event.contexts;
  }
  return event;
}

// Initialise Sentry for the Node.js API runtime.
// No-op when SENTRY_DSN is absent (local dev, preview deploys without secrets).
if (process.env.SENTRY_DSN) {
  SentryNode.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'production',
    // 10% trace sampling — higher rates increase cost and PII exposure risk
    tracesSampleRate: 0.1,
    beforeSend: apiLgpdBeforeSend,
  });
}

const LGPD_SENSITIVE_PATTERN = /\b(relations|notes)\b/i;

/**
 * Sanitizes an error message to ensure it does not leak LGPD-sensitive field names.
 */
function sanitizeErrorMessage(message: string): string {
  if (LGPD_SENSITIVE_PATTERN.test(message)) {
    return 'Internal processing error';
  }
  return message;
}

export function notFound(c: Context, message = 'Resource not found'): Response {
  return c.json<ApiError>({ error: 'NotFound', message }, 404);
}

export function unauthorized(c: Context, message = 'Unauthorized'): Response {
  return c.json<ApiError>({ error: 'Unauthorized', message }, 401);
}

export function forbidden(c: Context, message = 'Forbidden'): Response {
  return c.json<ApiError>({ error: 'Forbidden', message }, 403);
}

export function badRequest(c: Context, message: string): Response {
  return c.json<ApiError>({ error: 'BadRequest', message: sanitizeErrorMessage(message) }, 400);
}

export function conflict(c: Context, message: string): Response {
  return c.json<ApiError>({ error: 'Conflict', message: sanitizeErrorMessage(message) }, 409);
}

export function internalError(c: Context, err?: unknown): Response {
  // Log the raw error server-side (never exposed to client)
  if (err) {
    // Use console.error for server logs — filter out sensitive data
    const safeMessage = err instanceof Error ? err.message : String(err);
    console.error('[API Error]', sanitizeErrorMessage(safeMessage));
    // Capture to Sentry for alert-on-unhandled-exception rule (NC-02).
    // beforeSend hook above strips LGPD fields before transmission.
    if (process.env.SENTRY_DSN) {
      SentryNode.captureException(err);
    }
  }
  return c.json<ApiError>(
    { error: 'InternalServerError', message: 'An unexpected error occurred' },
    500
  );
}
