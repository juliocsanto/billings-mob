-- Migration: 20260531000004_whatsapp_webhook.sql
-- Sprint 4: configuração de webhook WhatsApp

CREATE TABLE IF NOT EXISTS whatsapp_webhook_config (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  verify_token      TEXT NOT NULL,
  verify_token_hash TEXT NOT NULL,
  phone_number_id   TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_whatsapp_webhook_updated_at
  BEFORE UPDATE ON whatsapp_webhook_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE whatsapp_webhook_config ENABLE ROW LEVEL SECURITY;
