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

const mockGetUser = vi.fn();

vi.mock('../supabaseClient', () => ({
  createAuthenticatedClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
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

  it('calls next and sets auth context when token is valid', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: MOCK_USER_ID,
          user_metadata: { role: 'student' },
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

  it('sets role to "student" when user_metadata.role is missing', async () => {
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

  it('sets role to "instructor" when user_metadata.role is instructor', async () => {
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

  it('strips "Bearer " prefix and passes only the raw JWT to Supabase', async () => {
    const { createAuthenticatedClient } = await import('../supabaseClient');
    mockGetUser.mockResolvedValue({
      data: { user: { id: MOCK_USER_ID, user_metadata: { role: 'student' } } },
      error: null,
    });

    const app = buildApp();
    await app.request('/protected', {
      headers: { Authorization: `Bearer ${MOCK_JWT}` },
    });

    expect(createAuthenticatedClient).toHaveBeenCalledWith(MOCK_JWT);
  });
});
