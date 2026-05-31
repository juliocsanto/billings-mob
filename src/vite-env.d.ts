/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Production auth redirect base URL — set in .env.production.
   *  Falls back to window.location.origin when absent (dev without .env). */
  readonly VITE_AUTH_REDIRECT_URL?: string;
  /**
   * Firebase API Key for FCM token registration.
   * When absent (dev / CI), usePushNotifications generates a mock token.
   * Sprint 5+: set in .env.production to enable real FCM push delivery.
   * LGPD: never log this value — it identifies the app, not the user, but
   * combined with an fcm_token it could be used to send unsolicited pushes.
   */
  readonly VITE_FIREBASE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
