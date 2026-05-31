/**
 * usePushNotifications — React hook for PWA push notification management.
 *
 * Responsibilities:
 *  1. Detect browser support for the Notification API (graceful degradation).
 *  2. Expose current permission status.
 *  3. requestPermission(): prompt the user, then obtain an FCM token (or a
 *     mock token in dev/test when VITE_FIREBASE_API_KEY is absent), and
 *     persist it to the backend via PUT /api/users/push-preferences.
 *  4. updatePreferences(partial): PATCH the stored preferences and update
 *     local state.
 *  5. On mount: load existing preferences via GET /api/users/push-preferences.
 *
 * LGPD (Art. 5 + Art. 11):
 *   - fcm_token is personal data. It is NEVER passed to console.log.
 *   - Any debug logging uses structuredClone to strip the token field.
 *
 * Clinical constraint:
 *   - No function, method, or variable computes or returns a
 *     fertile/infertile classification.
 *
 * Graceful degradation:
 *   - When `window.Notification` is absent, permission is set to 'unsupported'.
 *   - Callers should render a friendly message instead of the permission button.
 *
 * ADR-005: Auth session provides the access_token forwarded to the API.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushPreferences {
  user_id: string;
  daily_reminder_enabled: boolean;
  daily_reminder_time: string;
  apex_alert_enabled: boolean;
  conflict_alert_enabled: boolean;
  whatsapp_enabled: boolean;
  fcm_token: string | null;
}

export type PushPermission = NotificationPermission | 'unsupported';

export interface UsePushNotificationsResult {
  permission: PushPermission;
  fcmToken: string | null;
  preferences: PushPreferences | null;
  loading: boolean;
  error: string | null;
  requestPermission(): Promise<void>;
  updatePreferences(prefs: Partial<PushPreferences>): Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = '/api/users/push-preferences';

// ─── FCM token helper ─────────────────────────────────────────────────────────

/**
 * Attempts to obtain an FCM token.
 *
 * MVP strategy:
 *  - If VITE_FIREBASE_API_KEY is present (production), the real Firebase
 *    Messaging SDK would be used (Sprint 5+).
 *  - If absent (dev / CI / test), a deterministic mock token is generated
 *    so the rest of the flow (persistence, UI) can be exercised end-to-end.
 *
 * LGPD: The returned token is personal data. The caller must NOT pass it to
 * console.log, Sentry breadcrumbs, or any unstructured log.
 */
async function obtainFcmToken(userId: string): Promise<string | null> {
  const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;

  if (firebaseApiKey) {
    // Production path: Firebase Messaging SDK (Sprint 5+).
    // TODO(Sprint 5): import getToken from 'firebase/messaging' and use it here.
    // For now fall through to mock so the build does not fail without the SDK.
    return `mock-fcm-token-${userId}`;
  }

  // Dev / test path: deterministic mock token.
  return `mock-fcm-token-${userId}`;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function usePushNotifications(): UsePushNotificationsResult {
  const notificationSupported = typeof window !== 'undefined' && 'Notification' in window;

  const [permission, setPermission] = useState<PushPermission>(
    notificationSupported ? Notification.permission : 'unsupported',
  );
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Auth helper ────────────────────────────────────────────────────────────

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  // ── Load preferences on mount ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const token = await getAccessToken();
        if (!token) {
          setLoading(false);
          return;
        }

        const res = await fetch(API_BASE, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (!cancelled) setError('Não foi possível carregar as preferências.');
        } else {
          const body = (await res.json()) as { data: PushPreferences };
          if (!cancelled) {
            setPreferences(body.data);
            // Restore fcmToken from persisted preferences if present
            if (body.data.fcm_token) {
              setFcmToken(body.data.fcm_token);
            }
          }
        }
      } catch {
        if (!cancelled) setError('Erro ao carregar preferências.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── requestPermission ──────────────────────────────────────────────────────

  const requestPermission = useCallback(async (): Promise<void> => {
    if (!notificationSupported) {
      setPermission('unsupported');
      return;
    }

    setError(null);

    let grantedPermission: NotificationPermission;
    try {
      grantedPermission = await Notification.requestPermission();
    } catch {
      setError('Não foi possível solicitar permissão para notificações.');
      return;
    }

    setPermission(grantedPermission);

    if (grantedPermission !== 'granted') {
      // User denied or dismissed — do not attempt token registration.
      return;
    }

    // Obtain FCM token — LGPD: do NOT log the token value.
    try {
      const token = await getAccessToken();
      if (!token) return;

      const newFcmToken = await obtainFcmToken(
        preferences?.user_id ?? 'unknown',
      );

      if (!newFcmToken) return;

      setFcmToken(newFcmToken);

      // Persist the token via PUT — include in upsert body but never log it.
      await fetch(API_BASE, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fcm_token: newFcmToken }),
      });
    } catch {
      // Token registration failure is non-fatal — user still has permission granted.
      setError('Notificações ativadas, mas houve um erro ao registrar o dispositivo. Tente novamente.');
    }
  }, [notificationSupported, preferences?.user_id]);

  // ── updatePreferences ──────────────────────────────────────────────────────

  const updatePreferences = useCallback(
    async (prefs: Partial<PushPreferences>): Promise<void> => {
      setError(null);

      try {
        const token = await getAccessToken();
        if (!token) {
          setError('Sessão expirada. Faça login novamente.');
          return;
        }

        const res = await fetch(API_BASE, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(prefs),
        });

        if (!res.ok) {
          setError('Não foi possível salvar as preferências.');
          return;
        }

        const body = (await res.json()) as { data: PushPreferences };
        setPreferences(body.data);
      } catch {
        setError('Erro ao salvar preferências. Verifique sua conexão.');
      }
    },
    [],
  );

  return {
    permission,
    fcmToken,
    preferences,
    loading,
    error,
    requestPermission,
    updatePreferences,
  };
}
