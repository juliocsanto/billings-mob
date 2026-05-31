-- Migration: 20260531000002_push_preferences.sql
-- Sprint 4: preferências de push notification por usuário

CREATE TABLE IF NOT EXISTS push_preferences (
  user_id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_reminder_enabled   BOOLEAN NOT NULL DEFAULT true,
  daily_reminder_time      TEXT NOT NULL DEFAULT '21:00'
                             CHECK (daily_reminder_time ~ '^\d{2}:\d{2}$'),
  apex_alert_enabled       BOOLEAN NOT NULL DEFAULT true,
  conflict_alert_enabled   BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled         BOOLEAN NOT NULL DEFAULT false,
  fcm_token                TEXT CHECK (char_length(fcm_token) <= 512),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE push_preferences IS 'Preferências de notificação push por usuário. fcm_token: LGPD dado pessoal — excluir junto com a conta.';
COMMENT ON COLUMN push_preferences.fcm_token IS 'Token FCM do dispositivo/browser. LGPD: dado pessoal, não clínico. Excluir no endpoint DELETE /users/:id (direito ao esquecimento).';

CREATE TRIGGER trg_push_preferences_updated_at
  BEFORE UPDATE ON push_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE push_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_prefs_own_read" ON push_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_prefs_own_insert" ON push_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_prefs_own_update" ON push_preferences FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON push_preferences TO authenticated;
