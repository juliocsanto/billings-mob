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
 */
import type { Context } from 'hono';

export type ApiError = {
  error: string;
  message: string;
};

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
  }
  return c.json<ApiError>(
    { error: 'InternalServerError', message: 'An unexpected error occurred' },
    500
  );
}
