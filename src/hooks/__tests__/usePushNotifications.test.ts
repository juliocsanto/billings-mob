// @vitest-environment jsdom
/**
 * Unit tests — usePushNotifications hook
 *
 * Covers:
 *  - Returns permission: 'unsupported' when window.Notification does not exist
 *  - requestPermission() updates state when browser grants permission
 *  - requestPermission() does not call fetch when permission is denied
 *  - updatePreferences() calls PUT /api/users/push-preferences with correct body
 *  - Loads existing preferences on mount via GET /api/users/push-preferences
 *  - Returns permission: 'default' when Notification API exists but not yet requested
 *  - Mock FCM token generated when VITE_FIREBASE_API_KEY is not defined
 *
 * LGPD: fcm_token is not logged in console — validated by spy on console.log.
 * Clinical constraint: no fertile/infertile language in hook.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';

// ── Shared fetch mock ─────────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── Default preferences fixture ───────────────────────────────────────────────
const DEFAULT_PREFS = {
  user_id: 'user-123',
  daily_reminder_enabled: false,
  daily_reminder_time: '21:00',
  apex_alert_enabled: true,
  conflict_alert_enabled: true,
  whatsapp_enabled: false,
  fcm_token: null,
};

// ── Mock supabase client (hook reads session from it) ─────────────────────────
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'mock-access-token',
            user: { id: 'user-123' },
          },
        },
      }),
    },
  },
}));

// Import hook after mocks
import { usePushNotifications } from '../usePushNotifications';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePrefsResponse(prefs = DEFAULT_PREFS) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: prefs }),
  } as Response);
}

function makePutResponse(prefs = DEFAULT_PREFS) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: prefs }),
  } as Response);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: GET preferences succeeds
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: DEFAULT_PREFS }),
    });
  });

  afterEach(() => {
    // Clean up any Notification global we may have attached
    vi.restoreAllMocks();
  });

  // ── Unsupported browser ────────────────────────────────────────────────────

  it('returns permission "unsupported" when window.Notification does not exist', async () => {
    // Temporarily remove Notification from global scope
    const originalNotification = global.Notification;
    // @ts-expect-error intentional
    delete global.Notification;

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.permission).toBe('unsupported');

    // Restore
    global.Notification = originalNotification;
  });

  // ── Default state when Notification API exists ────────────────────────────

  it('returns permission "default" when Notification is available but not yet requested', async () => {
    // Provide a minimal Notification stub
    Object.defineProperty(global, 'Notification', {
      writable: true,
      value: class {
        static permission = 'default';
        static requestPermission = vi.fn().mockResolvedValue('default');
      },
    });

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.permission).toBe('default');
  });

  // ── Load preferences on mount ─────────────────────────────────────────────

  it('loads preferences on mount via GET /api/users/push-preferences', async () => {
    Object.defineProperty(global, 'Notification', {
      writable: true,
      value: class {
        static permission = 'default';
        static requestPermission = vi.fn().mockResolvedValue('default');
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: DEFAULT_PREFS }),
    });

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/users/push-preferences',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.current.preferences).toEqual(DEFAULT_PREFS);
  });

  // ── requestPermission — granted ───────────────────────────────────────────

  it('requestPermission() updates permission to "granted" and generates mock FCM token', async () => {
    Object.defineProperty(global, 'Notification', {
      writable: true,
      value: class {
        static permission = 'default';
        static requestPermission = vi.fn().mockResolvedValue('granted');
      },
    });

    // GET prefs on mount
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: DEFAULT_PREFS }),
    });

    // PUT to save fcm_token after permission is granted
    const updatedPrefs = { ...DEFAULT_PREFS, fcm_token: null };
    mockFetch.mockResolvedValueOnce(makePutResponse(updatedPrefs));

    // Ensure VITE_FIREBASE_API_KEY is absent so mock token path is exercised
    const origKey = import.meta.env.VITE_FIREBASE_API_KEY;
    delete (import.meta.env as Record<string, unknown>).VITE_FIREBASE_API_KEY;

    try {
      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.permission).toBe('granted');
      // Mock FCM token must be set (starts with "mock-fcm-token-")
      expect(result.current.fcmToken).toMatch(/^mock-fcm-token-/);
    } finally {
      if (origKey !== undefined) {
        (import.meta.env as Record<string, unknown>).VITE_FIREBASE_API_KEY = origKey;
      }
    }
  });

  // ── requestPermission — denied ────────────────────────────────────────────

  it('requestPermission() does NOT call PUT when permission is denied', async () => {
    Object.defineProperty(global, 'Notification', {
      writable: true,
      value: class {
        static permission = 'default';
        static requestPermission = vi.fn().mockResolvedValue('denied');
      },
    });

    // GET prefs on mount
    mockFetch.mockResolvedValueOnce(makePrefsResponse());

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callCountAfterMount = mockFetch.mock.calls.length;

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.permission).toBe('denied');
    expect(result.current.fcmToken).toBeNull();
    // No additional fetch calls after mount
    expect(mockFetch.mock.calls.length).toBe(callCountAfterMount);
  });

  // ── updatePreferences ─────────────────────────────────────────────────────

  it('updatePreferences() calls PUT /api/users/push-preferences with correct body', async () => {
    Object.defineProperty(global, 'Notification', {
      writable: true,
      value: class {
        static permission = 'granted';
        static requestPermission = vi.fn().mockResolvedValue('granted');
      },
    });

    // GET on mount
    mockFetch.mockResolvedValueOnce(makePrefsResponse());

    // PUT response
    const updatedPrefs = { ...DEFAULT_PREFS, daily_reminder_enabled: true };
    mockFetch.mockResolvedValueOnce(makePutResponse(updatedPrefs));

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updatePreferences({ daily_reminder_enabled: true });
    });

    // Find the PUT call
    const putCall = mockFetch.mock.calls.find(
      ([url, opts]) => url === '/api/users/push-preferences' && opts?.method === 'PUT',
    );
    expect(putCall).toBeDefined();

    const body = JSON.parse(putCall![1].body as string) as Record<string, unknown>;
    expect(body.daily_reminder_enabled).toBe(true);

    // State should reflect the update
    expect(result.current.preferences?.daily_reminder_enabled).toBe(true);
  });

  it('sets error when updatePreferences() fetch fails', async () => {
    Object.defineProperty(global, 'Notification', {
      writable: true,
      value: class {
        static permission = 'default';
        static requestPermission = vi.fn().mockResolvedValue('default');
      },
    });

    // GET on mount
    mockFetch.mockResolvedValueOnce(makePrefsResponse());

    // PUT fails
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updatePreferences({ daily_reminder_enabled: true });
    });

    expect(result.current.error).not.toBeNull();
  });

  // ── LGPD: fcm_token not in console.log ───────────────────────────────────

  it('never logs fcm_token in console.log', async () => {
    Object.defineProperty(global, 'Notification', {
      writable: true,
      value: class {
        static permission = 'default';
        static requestPermission = vi.fn().mockResolvedValue('granted');
      },
    });

    const consoleSpy = vi.spyOn(console, 'log');

    // GET on mount
    mockFetch.mockResolvedValueOnce(makePrefsResponse());
    // PUT for token save
    mockFetch.mockResolvedValueOnce(makePutResponse());

    const origKey = import.meta.env.VITE_FIREBASE_API_KEY;
    delete (import.meta.env as Record<string, unknown>).VITE_FIREBASE_API_KEY;

    try {
      const { result } = renderHook(() => usePushNotifications());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.requestPermission();
      });

      // Check that no console.log call contains a token pattern
      for (const call of consoleSpy.mock.calls) {
        const msg = call.join(' ');
        expect(msg).not.toMatch(/mock-fcm-token/);
      }
    } finally {
      consoleSpy.mockRestore();
      if (origKey !== undefined) {
        (import.meta.env as Record<string, unknown>).VITE_FIREBASE_API_KEY = origKey;
      }
    }
  });
});
