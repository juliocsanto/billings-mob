-- =============================================================================
-- Migration: 20260607000001_add_feedback_system
-- Description: Tabelas do sistema de feedback comunitário com pipeline de IA.
-- ADR-018: Sistema de Feedback Comunitario com Pipeline de Triage por IA
-- ADR-019: Resend como Provedor de Email Transacional
--
-- LGPD: conteúdo de feedback é dado público do usuário (não clínico).
--       Campos de aprovação/triage são protegidos via service role (RLS).
--
-- Restrição clínica (inviolável): nenhuma coluna desta tabela classifica
-- ou armazena dados de ciclo como fértil/infértil/seguro/inseguro.
-- =============================================================================

-- UP

-- ─── 1. app_feedback — posts do fórum público ─────────────────────────────

CREATE TABLE app_feedback (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role         TEXT NOT NULL CHECK (author_role IN ('student', 'instructor')),
  category            TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'improvement')),
  title               TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  content             TEXT NOT NULL CHECK (char_length(content) BETWEEN 10 AND 2000),
  -- Pipeline status — alinhado com ADR-018
  status              TEXT NOT NULL DEFAULT 'pending_triage'
                      CHECK (status IN (
                        'pending_triage',
                        'pending_admin',
                        'approved',
                        'rejected',
                        'implementing',
                        'deployed',
                        'final_approved'
                      )),
  -- Triage por IA
  triage_type         TEXT CHECK (triage_type IN ('billings_method', 'app_functionality')),
  triage_result       JSONB,
  triage_at           TIMESTAMPTZ,
  -- Rejeição
  rejection_reason    TEXT,
  -- Aprovação admin estágio 1
  approved_at         TIMESTAMPTZ,
  approved_by         UUID REFERENCES auth.users(id),
  approval_note       TEXT,
  -- Aprovação admin estágio 2 (final — confirma deploy)
  final_approved_at   TIMESTAMPTZ,
  final_approved_by   UUID REFERENCES auth.users(id),
  -- Controle de desconto
  discount_applied    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Auditoria
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_feedback IS
  'Posts do fórum de feedback comunitário. ADR-018. Sem dados clínicos (LGPD).';
COMMENT ON COLUMN app_feedback.triage_result IS
  'Resultado estruturado da triage por Claude. FeedbackTriageResult (JSONB). Null até processar.';
COMMENT ON COLUMN app_feedback.discount_applied IS
  'True quando desconto Asaas foi aplicado com sucesso (final_approved).';

-- ─── 2. app_feedback_comments — comentários do fórum ─────────────────────

CREATE TABLE app_feedback_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES app_feedback(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('student', 'instructor', 'admin')),
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_feedback_comments IS
  'Comentários de usuários autenticados sobre posts de feedback. ADR-018.';

-- ─── 3. app_feedback_discounts — rastreamento de descontos aplicados ──────

CREATE TABLE app_feedback_discounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id         UUID NOT NULL REFERENCES app_feedback(id) ON DELETE CASCADE,
  beneficiary_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asaas_discount_id   TEXT,
  discount_percent    NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  applied_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  status              TEXT NOT NULL DEFAULT 'applied'
                      CHECK (status IN ('applied', 'failed', 'reversed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_feedback_discounts IS
  'Registro de descontos Asaas emitidos por feedback final_approved. ADR-018 + ADR-015.';
COMMENT ON COLUMN app_feedback_discounts.asaas_discount_id IS
  'ID retornado pela Asaas. Null se falhou ou se em ambiente mock.';

-- ─── 4. Índices ────────────────────────────────────────────────────────────

CREATE INDEX idx_app_feedback_status
  ON app_feedback(status);

CREATE INDEX idx_app_feedback_author_id
  ON app_feedback(author_id);

CREATE INDEX idx_app_feedback_created_at
  ON app_feedback(created_at DESC);

CREATE INDEX idx_app_feedback_comments_feedback_id
  ON app_feedback_comments(feedback_id);

-- ─── 5. Triggers updated_at ────────────────────────────────────────────────
-- Reutiliza update_updated_at() definida em 20260524000001_initial_schema.sql

CREATE TRIGGER trg_app_feedback_updated_at
  BEFORE UPDATE ON app_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_app_feedback_comments_updated_at
  BEFORE UPDATE ON app_feedback_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 6. Row Level Security ─────────────────────────────────────────────────

ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_feedback_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_feedback_discounts ENABLE ROW LEVEL SECURITY;

-- app_feedback: qualquer autenticado pode ler posts públicos
CREATE POLICY "feedback_select_authenticated"
  ON app_feedback FOR SELECT
  USING (auth.role() = 'authenticated');

-- app_feedback: usuário autenticado pode criar post (author_id = próprio uid)
CREATE POLICY "feedback_insert_own"
  ON app_feedback FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- app_feedback: UPDATE apenas via service role (admin/cron usam service role)
-- Campos de status, triage, aprovação são protegidos — clientes não podem alterar.
CREATE POLICY "feedback_update_service_only"
  ON app_feedback FOR UPDATE
  USING (auth.role() = 'service_role');

-- app_feedback: DELETE apenas via service role
CREATE POLICY "feedback_delete_service_only"
  ON app_feedback FOR DELETE
  USING (auth.role() = 'service_role');

-- app_feedback_comments: qualquer autenticado pode ler
CREATE POLICY "feedback_comments_select"
  ON app_feedback_comments FOR SELECT
  USING (auth.role() = 'authenticated');

-- app_feedback_comments: usuário autenticado pode comentar (author_id = próprio uid)
CREATE POLICY "feedback_comments_insert_own"
  ON app_feedback_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- app_feedback_comments: autor ou service role pode atualizar/deletar
CREATE POLICY "feedback_comments_update_own_or_service"
  ON app_feedback_comments FOR UPDATE
  USING (auth.uid() = author_id OR auth.role() = 'service_role');

CREATE POLICY "feedback_comments_delete_own_or_service"
  ON app_feedback_comments FOR DELETE
  USING (auth.uid() = author_id OR auth.role() = 'service_role');

-- app_feedback_discounts: somente service role (contém dados financeiros de assinatura)
CREATE POLICY "feedback_discounts_service_only"
  ON app_feedback_discounts FOR ALL
  USING (auth.role() = 'service_role');

-- Permite que o próprio usuário veja seus descontos (beneficiário)
CREATE POLICY "feedback_discounts_select_own"
  ON app_feedback_discounts FOR SELECT
  USING (auth.uid() = beneficiary_id);

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================

-- Para reverter esta migration, execute:
--
-- DROP TRIGGER IF EXISTS trg_app_feedback_comments_updated_at ON app_feedback_comments;
-- DROP TRIGGER IF EXISTS trg_app_feedback_updated_at ON app_feedback;
-- DROP INDEX IF EXISTS idx_app_feedback_comments_feedback_id;
-- DROP INDEX IF EXISTS idx_app_feedback_created_at;
-- DROP INDEX IF EXISTS idx_app_feedback_author_id;
-- DROP INDEX IF EXISTS idx_app_feedback_status;
-- DROP TABLE IF EXISTS app_feedback_discounts;
-- DROP TABLE IF EXISTS app_feedback_comments;
-- DROP TABLE IF EXISTS app_feedback;
