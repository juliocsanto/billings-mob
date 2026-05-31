/**
 * Unit tests — auth.ts (requireAuth middleware)
 *
 * Tests the Hono auth middleware in isolation.
 * Supabase client is mocked to test all auth paths:
 *   - Missing Authorization header -> 401
 *   - Malformed Bearer token -> 401
 *   - Valid token, Supabase returns user -> next() called, auth context set
 *   - Valid token, Supabase returns error -> 401
 *   - Valid token, Supabase returns null user -> 401
 *
 * ADR-005: Supabase Auth JWT is the authentication layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { MOCK_USER_ID, MOCK_JWT } from './setup';

// ─── Mock supabaseClient ─────────────────────────────────────────────────────

// SEC-003 FIX: requireAuth now also queries user_profiles for the authoritative role.
// Use vi.hoisted() so these mocks are available inside the vi.mock() factory,
// which Vitest hoists before module-level const/let declarations.
const { mockGetUser, mockProfileSingle } = vi.hoisted(() => {
  const mockProfileSingle = vi.fn(() =>
    Promise.resolve({ data: null, error: null })
  );
  const mockGetUser = vi.fn();
  return { mockGetUser, mockProfileSingle };
});

vi.mock('../supabaseClient', () => ({
  createAuthenticatedClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: mockProfileSingle,
            }),
          }),
        };
      }
      return { select: vi.fn() };
    },
  })),
  createServiceClient: vi.fn(),
}));

import { requireAuth } from '../auth';

// ─── Test app setup ──────────────────────────────────────────────────────────

function buildApp() {
  const app = new Hono();
  app.use('*', requireAuth);
  app.get('/protected', (c) => {
    const auth = c.get('auth');
    return c.json({ userId: auth.userId, role: auth.role });
  });
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('requireAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: user_profiles returns null (simulates pre-trigger account — backward-compat path)
    mockProfileSingle.mockResolvedValue({ data: null, error: null });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const app = buildApp();
    const res = await app.request('/protected');

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string; message: string };
    expect(json.error).toBe('Unauthorized');
    expect(json.message).toContain('Missing or invalid');
  });

  it('returns 401 when Authorization header does not start with "Bearer "', async () => {
    const app = buildApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 when Supabase getUser returns error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Token expired'),
    });

    const app = buildApp();
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${MOCK_JWT}` },
    });

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string; message: string };
    expect(json.error).toBe('Unauthorized');
    expect(json.message).toContain('Invalid or expired');
  });

  it('returns 401 when Supabase getUser returns null user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const app = buildApp();
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${MOCK_JWT}` },
    });

    expect(res.status).toBe(401);
  });

  // SEC-003 FIX: role is now read from user_profiles (authoritative server-side source).
  it('calls next and sets auth context with role from user_profiles', async () => {
    mockProfileSingle.mockResolvedValue({ data: { role: 'student' }, error: null });
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: MOCK_USER_ID,
          user_metadata: {},
        },
      },
      error: null,
    });

    const app = buildApp();
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${MOCK_JWT}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { userId: string; role: string };
    expect(json.userId).toBe(MOCK_USER_ID);
    expect(json.role).toBe('student');
  });

  // SEC-003 FIX: backward-compat — if user_profiles row is absent (pre-trigger accounts),
  // fall back to user_metadata.role ?? 'student'.
  it('falls back to "student" when user_profiles row is missing and user_metadata.role is absent', async () => {
    // data: null simulates missing profile row (pre-trigger account — backward-compat path)
    mockProfileSingle.mockResolvedValue({ data: null, error: null });
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: MOCK_USER_ID,
          user_metadata: {},
        },
      },
      error: null,
    });

    const app = buildApp();
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${MOCK_JWT}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { role: string };
    expect(json.role).toBe('student');
  });

  // SEC-003 FIX: user_profiles.role='instructor' is the authoritative source.
  // user_metadata.role is ignored — even if a user sets it to 'instructor' at sign-up,
  // the user_profiles value (set by server-side trigger) takes precedence.
  it('sets role to "instructor" when user_profiles.role is instructor', async () => {
    mockProfileSingle.mockResolvedValue({ data: { role: 'instructor' }, error: null });
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: MOCK_USER_ID,
          user_metadata: { role: 'instructor' },
        },
      },
      error: null,
    });

    const app = buildApp();
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${MOCK_JWT}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { role: string };
    expect(json.role).toBe('instructor');
  });

  // SEC-003 FIX: verify that user_metadata.role='instructor' is NOT sufficient on its own.
  // If user_profiles.role='student', the user is treated as student regardless of metadata.
  it('treats user as student when user_profiles.role=student even if user_metadata.role=instructor', async () => {
    mockProfileSingle.mockResolvedValue({ data: { role: 'student' }, error: null });
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: MOCK_USER_ID,
          // Attacker sets role:instructor in metadata — should be ignored
          user_metadata: { role: 'instructor' },
        },
      },
      error: null,
    });

    const app = buildApp();
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${MOCK_JWT}` },
    });

    expect(res.status).toBe(200);
    const json = await res.json() as { role: string };
    // user_profiles.role='student' wins over user_metadata.role='instructor'
    expect(json.role).toBe('student');
  });

  it('strips "Bearer " prefix and passes only the raw JWT to Supabase', async () => {
    const { createAuthenticatedClient } = await import('../supabaseClient');
    mockProfileSingle.mockResolvedValue({ data: { role: 'student' }, error: null });
    mockGetUser.mockResolvedValue({
      data: { user: { id: MOCK_USER_ID, user_metadata: {} } },
      error: null,
    });

    const app = buildApp();
    await app.request('/protected', {
      headers: { Authorization: `Bearer ${MOCK_JWT}` },
    });

    expect(createAuthenticatedClient).toHaveBeenCalledWith(MOCK_JWT);
  });
});
