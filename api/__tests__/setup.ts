/**
 * Integration test setup — Hono handler tests via app.request()
 *
 * Strategy: mock Supabase clients and auth middleware so handlers
 * can be tested in-process without a real Supabase instance.
 * This covers 100% of the handler code paths (routes, error branches, LGPD constraints).
 *
 * ADR-002: Hono.js runtime — tests use app.request() (Hono's native test API)
 * ADR-005: auth middleware is mocked to inject controlled auth contexts
 * LGPD: tests verify that relations/notes NEVER appear in audit_log calls
 */

export const MOCK_USER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const MOCK_INSTRUCTOR_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
export const MOCK_CYCLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d481';
export const MOCK_OBS_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d482';
export const MOCK_VERSION_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d483';
export const MOCK_JWT = 'mock.jwt.token';
export const MOCK_INSTRUCTOR_JWT = 'mock.instructor.jwt';

/** Bearer header for student requests */
export const studentHeaders = {
  Authorization: `Bearer ${MOCK_JWT}`,
  'Content-Type': 'application/json',
};

/** Bearer header for instructor requests */
export const instructorHeaders = {
  Authorization: `Bearer ${MOCK_INSTRUCTOR_JWT}`,
  'Content-Type': 'application/json',
};
