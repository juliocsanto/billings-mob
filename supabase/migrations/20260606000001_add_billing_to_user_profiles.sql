-- =============================================================================
-- Migration: 20260606000001_add_billing_to_user_profiles
-- Description: Adiciona colunas de billing (Asaas) à tabela user_profiles.
-- ADR-015: Asaas hexagonal adapter
-- LGPD: apenas metadados de assinatura — nunca dados de cartão.
-- =============================================================================

-- UP

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('active', 'expired', 'trial')),
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT
    CHECK (subscription_plan IN ('instructor_monthly', 'instructor_annual') OR subscription_plan IS NULL),
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.subscription_status IS
  'Status da assinatura Asaas: active | expired | trial. Atualizado apenas via service role (webhook).';
COMMENT ON COLUMN user_profiles.asaas_subscription_id IS
  'ID externo da assinatura na Asaas. Nunca contém dados de cartão (PCI-DSS escopo reduzido).';
COMMENT ON COLUMN user_profiles.subscription_plan IS
  'Plano contratado: instructor_monthly (R$99/mês) | instructor_annual (R$990/ano). NULL = trial.';
COMMENT ON COLUMN user_profiles.subscription_expires_at IS
  'Data/hora de expiração da assinatura atual. NULL em trial ou quando não definida.';

-- Índice para queries de status (ex: listar instrutoras com assinatura ativa)
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_status
  ON user_profiles(subscription_status);

-- =============================================================================
-- RLS: impede que clientes atualizem subscription_status diretamente
-- Apenas o service role (webhook endpoint) pode alterar este campo.
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_client_subscription_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    RAISE EXCEPTION 'subscription_status can only be updated via service role';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplica o trigger apenas para sessões que NÃO são o service role
-- current_setting('role') retorna 'authenticated' para usuários JWT normais
CREATE TRIGGER prevent_client_subscription_status_update
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  WHEN (current_setting('role') != 'service_role')
  EXECUTE FUNCTION prevent_client_subscription_update();

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================

-- Para reverter esta migration, execute:
--
-- DROP TRIGGER IF EXISTS prevent_client_subscription_status_update ON user_profiles;
-- DROP FUNCTION IF EXISTS prevent_client_subscription_update();
-- DROP INDEX IF EXISTS idx_user_profiles_subscription_status;
-- ALTER TABLE user_profiles
--   DROP COLUMN IF EXISTS subscription_expires_at,
--   DROP COLUMN IF EXISTS subscription_plan,
--   DROP COLUMN IF EXISTS asaas_subscription_id,
--   DROP COLUMN IF EXISTS subscription_status;
