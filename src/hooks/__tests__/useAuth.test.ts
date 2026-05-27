// @vitest-environment jsdom
/**
 * Tests for useAuth hook.
 *
 * Covers:
 *  - Initial state: loading=true, user=null, session=null
 *  - Resolves to authenticated state when Supabase returns a session
 *  - Resolves to unauthenticated state when no session exists
 *  - signOut clears user and session
 *  - signInWithMagicLink delegates to supabase.auth.signInWithOtp
 *  - Anonymous data migration to user-scoped key on first login
 *
 * Pattern: vi.mock factory uses vi.fn() inline to avoid hoisting issues.
 * The mock references are obtained via import after mocking.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';

// ── Mock the supabase client module ───────────────────────────────────────────
// vi.mock is hoisted to the top, so we use a factory that creates fresh vi.fn()
// instances. We store them on a shared object so tests can control behaviour.
const mockAuth = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
};

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockAuth.getSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockAuth.onAuthStateChange(...args),
      signInWithOtp: (...args: unknown[]) => mockAuth.signInWithOtp(...args),
      signOut: (...args: unknown[]) => mockAuth.signOut(...args),
    },
  },
}));

// ── Import hook after mock is registered ─────────────────────────────────────
import { useAuth } from '../useAuth';

// ── Default stub: onAuthStateChange returns a subscription ───────────────────
const mockUnsubscribe = vi.fn();

function stubDefaultBehaviour() {
  mockAuth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  stubDefaultBehaviour();
});

afterEach(() => {
  localStorage.clear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAuth', () => {
  it('starts with loading=true and no user/session', async () => {
    let resolveSession: (v: unknown) => void = () => {};
    mockAuth.getSession.mockReturnValue(new Promise(r => { resolveSession = r; }));

    const { result } = renderHook(() => useAuth());

    // Immediately after render: loading must be true
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();

    // Resolve session to clean up
    act(() => { resolveSession({ data: { session: null } }); });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets user and session when Supabase returns an active session', async () => {
    const fakeUser = { id: 'user-123', email: 'test@billings.app' };
    const fakeSession = { user: fakeUser, access_token: 'tok_abc' };

    mockAuth.getSession.mockResolvedValue({ data: { session: fakeSession } });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.session).toEqual(fakeSession);
  });

  it('sets user=null and session=null when no active session', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('clears user and session after signOut', async () => {
    const fakeUser = { id: 'user-456', email: 'aluna@billings.app' };
    const fakeSession = { user: fakeUser, access_token: 'tok_xyz' };

    mockAuth.getSession.mockResolvedValue({ data: { session: fakeSession } });
    mockAuth.signOut.mockResolvedValue({});

    // Capture onAuthStateChange callback to fire sign-out event
    let authCallback: (event: string, session: unknown) => void = () => {};
    mockAuth.onAuthStateChange.mockImplementation((cb: typeof authCallback) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(fakeUser);

    await act(async () => {
      await result.current.signOut();
      authCallback('SIGNED_OUT', null);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(mockAuth.signOut).toHaveBeenCalledOnce();
  });

  it('calls signInWithOtp with email and redirectTo', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    mockAuth.signInWithOtp.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const res = await result.current.signInWithMagicLink('test@billings.app');
      expect(res.error).toBeNull();
    });

    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({
      email: 'test@billings.app',
      options: { emailRedirectTo: expect.stringContaining('/auth/callback') },
    });
  });

  it('returns error when signInWithOtp fails', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    const authError = new Error('Rate limit exceeded');
    mockAuth.signInWithOtp.mockResolvedValue({ error: authError });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const res = await result.current.signInWithMagicLink('bad@email.com');
      expect(res.error).toBe(authError);
    });
  });

  it('migrates anonymous localStorage data to user-scoped key on first login', async () => {
    const anonData = { cycleStart: '2026-05-01', obs: {}, history: [] };
    localStorage.setItem('billings-mob-v1', JSON.stringify(anonData));

    const fakeUser = { id: 'user-789', email: 'migrated@billings.app' };
    const fakeSession = { user: fakeUser, access_token: 'tok_mig' };

    mockAuth.getSession.mockResolvedValue({ data: { session: fakeSession } });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Expect migration to user-scoped key
    const migrated = localStorage.getItem('billings-mob-v1-user-789');
    expect(migrated).not.toBeNull();
    expect(JSON.parse(migrated!)).toEqual(anonData);

    // Original anonymous key must still exist (backward compat)
    expect(localStorage.getItem('billings-mob-v1')).not.toBeNull();
  });

  it('does not overwrite existing user-scoped data during migration', async () => {
    const anonData = { cycleStart: '2026-04-01', obs: {}, history: [] };
    const existingUserData = { cycleStart: '2026-05-01', obs: { '2026-05-01': {} }, history: [] };

    localStorage.setItem('billings-mob-v1', JSON.stringify(anonData));
    localStorage.setItem('billings-mob-v1-user-999', JSON.stringify(existingUserData));

    const fakeUser = { id: 'user-999', email: 'existing@billings.app' };
    const fakeSession = { user: fakeUser, access_token: 'tok_exist' };

    mockAuth.getSession.mockResolvedValue({ data: { session: fakeSession } });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Must NOT overwrite the user's existing data
    const stored = localStorage.getItem('billings-mob-v1-user-999');
    expect(JSON.parse(stored!)).toEqual(existingUserData);
  });

  it('unsubscribes from auth state changes on unmount', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });

    const { unmount } = renderHook(() => useAuth());
    await waitFor(() => true);

    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledOnce();
  });
});
