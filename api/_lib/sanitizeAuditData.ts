/**
 * LGPD Art. 11 — Audit log sanitizer
 *
 * The fields 'relations', 'notes', and 'sensacao' are sensitive personal/health data.
 * They must NEVER appear in any log entry, at any stage.
 *
 * This function removes those fields before any data is written to audit_log.
 * It is enforced at the application layer (not only at the database level).
 */

const LGPD_SENSITIVE_FIELDS = ['relations', 'notes', 'sensacao'] as const;

/**
 * Returns a shallow copy of the object with LGPD-sensitive fields removed.
 * Pure function — does not mutate the input.
 * Returns null/undefined as-is if input is falsy.
 */
export function sanitizeForAuditLog<T>(data: T): T {
  if (data === null) return null as T;
  if (data === undefined) return undefined as T;
  if (typeof data !== 'object') return data;

  const sanitized = { ...(data as Record<string, unknown>) };
  for (const field of LGPD_SENSITIVE_FIELDS) {
    delete sanitized[field as string];
  }
  return sanitized as T;
}

/**
 * Type guard: ensures a log entry payload does not contain sensitive fields.
 * Used in assertions during development.
 */
export function assertNoSensitiveFields(data: Record<string, unknown>): void {
  for (const field of LGPD_SENSITIVE_FIELDS) {
    if (field in data) {
      throw new Error(
        `LGPD violation: field '${field}' must not appear in audit log. ` +
        `Call sanitizeForAuditLog() before logging.`
      );
    }
  }
}
