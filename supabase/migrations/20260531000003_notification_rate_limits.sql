-- Migration: 20260531000003_notification_rate_limits.sql
-- Sprint 4: controle de rate limit de notificações para evitar spam

CREATE TABLE IF NOT EXISTS notification_rate_limits (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  event_type     TEXT NOT NULL CHECK (event_type IN ('new_observation', 'conflict_detected', 'link_request', 'link_accepted')),
  dedup_key      TEXT NOT NULL,
  recipient_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel        TEXT NOT NULL CHECK (channel IN ('fcm', 'whatsapp')),
  CONSTRAINT uq_dedup_channel UNIQUE (dedup_key, channel)
);

CREATE INDEX idx_nrl_recipient ON notification_rate_limits(recipient_id);
CREATE INDEX idx_nrl_sent_at   ON notification_rate_limits(sent_at DESC);
CREATE INDEX idx_nrl_dedup     ON notification_rate_limits(dedup_key, sent_at DESC);

ALTER TABLE notification_rate_limits ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON notification_rate_limits TO authenticated;
