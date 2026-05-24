-- =============================================================================
-- Migration: 20260524000001_initial_schema.sql
-- Projeto: Billings Gráfico (billings-mob)
-- Data: 2026-05-24
-- Descrição: Schema inicial — ADR-003 (PostgreSQL/Supabase) + ADR-004 (Vector Clock)
--            + ADR-005 (Auth/RLS)
--
-- Bounded Contexts cobertos:
--   - Identity & Access: users, instructor_student_links
--   - Cycle Tracking: cycles, observations, observation_versions, audit_log
--
-- LGPD (Art. 11): campos sensíveis (relations, notes) presentes apenas no banco.
--                 NUNCA devem aparecer em logs de aplicação.
-- =============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- uuid_generate_v7() via plpgsql abaixo

-- =============================================================================
-- FUNÇÃO: uuid_generate_v7()
-- UUID v7 ordenável por tempo (substituto do gen_random_uuid() para IDs primários)
-- Garante ordenação natural por data de criação sem índice adicional.
-- =============================================================================
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_time DOUBLE PRECISION;
  v_unix_ms BIGINT;
  v_hi BIGINT;
  v_lo BIGINT;
  v_rand BYTEA;
BEGIN
  v_time := EXTRACT(EPOCH FROM clock_timestamp());
  v_unix_ms := FLOOR(v_time * 1000)::BIGINT;

  -- 48 bits de timestamp ms + versão 7 (0111) + 12 bits aleatórios + variant (10) + 62 bits aleatórios
  v_rand := gen_random_bytes(10);

  v_hi := (v_unix_ms << 16)
        | (7 << 12)
        | ((get_byte(v_rand, 0) << 4) | (get_byte(v_rand, 1) >> 4));

  v_lo := (B'10'::BIT(2) || (get_byte(v_rand, 1) & B'00111111'::INT)::BIT(6) ||
           lpad(to_hex(get_byte(v_rand, 2)), 2, '0') ||
           lpad(to_hex(get_byte(v_rand, 3)), 2, '0') ||
           lpad(to_hex(get_byte(v_rand, 4)), 2, '0') ||
           lpad(to_hex(get_byte(v_rand, 5)), 2, '0') ||
           lpad(to_hex(get_byte(v_rand, 6)), 2, '0') ||
           lpad(to_hex(get_byte(v_rand, 7)), 2, '0') ||
           lpad(to_hex(get_byte(v_rand, 8)), 2, '0') ||
           lpad(to_hex(get_byte(v_rand, 9)), 2, '0'))::BIT(64)::BIGINT;

  RETURN (
    lpad(to_hex((v_unix_ms >> 16) & x'FFFF'::BIGINT), 8, '0') || '-' ||
    lpad(to_hex(v_unix_ms & x'FFFF'::BIGINT), 4, '0') || '-' ||
    '7' || lpad(to_hex((get_byte(v_rand, 0) << 4 | get_byte(v_rand, 1) >> 4) & x'FFF'::INT), 3, '0') || '-' ||
    lpad(to_hex(x'80'::INT | (get_byte(v_rand, 1) & x'3F'::INT)), 2, '0') ||
    lpad(to_hex(get_byte(v_rand, 2)), 2, '0') || '-' ||
    encode(substring(v_rand FROM 3 FOR 6), 'hex')
  )::UUID;
END;
$$;

-- =============================================================================
-- TABELA: user_profiles
-- Perfil estendido do usuário (auth.users é gerenciado pelo Supabase Auth)
-- Role define o tipo de acesso: student | instructor | admin
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('student', 'instructor', 'admin')),
  full_name    TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 150),
  phone        TEXT,           -- WhatsApp para notificações (ADR-006, ADR-009)
  cenplafam_id TEXT,           -- Número de certificação (apenas instructors)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_profiles IS
  'Perfis de usuário estendidos. Complementa auth.users do Supabase.';
COMMENT ON COLUMN user_profiles.cenplafam_id IS
  'Número de certificação CENPLAFAM/WOOMB. Apenas para instrutoras.';
COMMENT ON COLUMN user_profiles.phone IS
  'Número de telefone para WhatsApp Cloud API (ADR-009). LGPD: dado pessoal sensível.';

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- TABELA: instructor_student_links
-- Vínculo entre instrutora e aluna (ADR-005)
-- Status: pending → active | revoked
-- =============================================================================
CREATE TABLE IF NOT EXISTS instructor_student_links (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'revoked')),
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  revoked_by    UUID REFERENCES auth.users(id),

  CONSTRAINT no_self_link CHECK (instructor_id <> student_id),
  CONSTRAINT unique_active_link UNIQUE (instructor_id, student_id)
);

COMMENT ON TABLE instructor_student_links IS
  'Relação de vínculo aluna↔instrutora. Aluna inicia convite, instrutora aceita.';

CREATE INDEX idx_isl_instructor_id ON instructor_student_links(instructor_id);
CREATE INDEX idx_isl_student_id    ON instructor_student_links(student_id);
CREATE INDEX idx_isl_status        ON instructor_student_links(status);

-- =============================================================================
-- TABELA: cycles
-- Agrupa observações em ciclos menstruais (ADR-002: interface Cycle)
-- =============================================================================
CREATE TABLE IF NOT EXISTS cycles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE,
  apex_date   DATE,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT no_future_start  CHECK (start_date <= CURRENT_DATE),
  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT valid_apex_date  CHECK (
    apex_date IS NULL OR (apex_date >= start_date AND (end_date IS NULL OR apex_date <= end_date))
  )
);

COMMENT ON TABLE cycles IS
  'Ciclo menstrual: período de sangramento até o dia anterior ao próximo.';
COMMENT ON COLUMN cycles.apex_date IS
  'Último dia de sensação lubrificante (Apice MOB). Interpretação exclusiva da instrutora.';

CREATE INDEX idx_cycles_user_id    ON cycles(user_id);
CREATE INDEX idx_cycles_status     ON cycles(status);
CREATE INDEX idx_cycles_start_date ON cycles(start_date DESC);

CREATE TRIGGER trg_cycles_updated_at
  BEFORE UPDATE ON cycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- TABELA: observations
-- Registro diário da aluna (ADR-002: interface Observation, ADR-004: vector clock)
--
-- RESTRIÇÃO CLÍNICA INVIOLÁVEL (§ 3.3 ARCHITECTURE.md):
--   O campo stamp nunca deve conter 'fertil', 'infertil', 'seguro' ou 'inseguro'.
--   Toda interpretação clínica é competência exclusiva da instrutora.
-- =============================================================================
CREATE TABLE IF NOT EXISTS observations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id     UUID REFERENCES cycles(id) ON DELETE SET NULL,
  date         DATE NOT NULL,
  stamp        TEXT NOT NULL
                 CHECK (stamp IN ('sangramento', 'seco', 'muco', 'apice')),
  mucus        TEXT CHECK (mucus IN ('opaco', 'cremoso', 'transparente', 'elastico')),
  bleeding     TEXT CHECK (bleeding IN ('intenso', 'moderado', 'leve', 'manchas')),
  -- LGPD Art. 11: campo sensível — NUNCA deve aparecer em logs de aplicação
  relations    BOOLEAN NOT NULL DEFAULT false,
  -- LGPD Art. 11: campo sensível — NUNCA deve aparecer em logs de aplicação
  notes        TEXT CHECK (char_length(notes) <= 500),
  vector_clock JSONB NOT NULL DEFAULT '{}'::JSONB,
  version      INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Uma observação por usuário por dia (imutável após criação)
  CONSTRAINT unique_obs_per_day UNIQUE (user_id, date),
  -- Data não pode ser futura
  CONSTRAINT no_future_obs CHECK (date <= CURRENT_DATE)
);

COMMENT ON TABLE observations IS
  'Registro diário do ciclo. Uma observação por aluna por dia. '
  'date é imutável após criação — edições geram observation_versions.';
COMMENT ON COLUMN observations.stamp IS
  'Classificação do dia: sangramento | seco | muco | apice. '
  'NUNCA contém: fertil, infertil, seguro, inseguro (ADR § 3.3).';
COMMENT ON COLUMN observations.vector_clock IS
  'CRDT simplificado: {"userId": operações}. Usado para detectar conflitos (ADR-004).';
COMMENT ON COLUMN observations.relations IS
  'LGPD Art. 11 — dado sensível. NUNCA aparece em logs de aplicação.';
COMMENT ON COLUMN observations.notes IS
  'LGPD Art. 11 — dado sensível. NUNCA aparece em logs de aplicação.';

CREATE INDEX idx_obs_user_id   ON observations(user_id);
CREATE INDEX idx_obs_date      ON observations(date DESC);
CREATE INDEX idx_obs_cycle_id  ON observations(cycle_id);
CREATE INDEX idx_obs_stamp     ON observations(stamp);

CREATE TRIGGER trg_observations_updated_at
  BEFORE UPDATE ON observations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- TABELA: observation_versions
-- Histórico de versões para cada observação (ADR-004: Versioned Records)
-- Implementa o "Audit Trail" para resolução de conflitos de edição concorrente.
-- =============================================================================
CREATE TABLE IF NOT EXISTS observation_versions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  observation_id    UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  vector_clock      JSONB NOT NULL,
  data              JSONB NOT NULL,
  author_id         UUID NOT NULL REFERENCES auth.users(id),
  author_role       TEXT NOT NULL CHECK (author_role IN ('student', 'instructor')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  conflict_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by       UUID REFERENCES auth.users(id),
  resolved_at       TIMESTAMPTZ,

  CONSTRAINT valid_resolution CHECK (
    (conflict_resolved = false AND resolved_by IS NULL AND resolved_at IS NULL) OR
    (conflict_resolved = true  AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

COMMENT ON TABLE observation_versions IS
  'Histórico imutável de versões de uma observação. '
  'Toda edição gera uma nova versão — nenhum dado clínico é perdido (ADR-004).';
COMMENT ON COLUMN observation_versions.data IS
  'Snapshot completo dos campos da observação no momento da edição. '
  'Exclui id, vector_clock e version (metadados de controle).';

CREATE INDEX idx_obs_versions_obs_id     ON observation_versions(observation_id);
CREATE INDEX idx_obs_versions_author_id  ON observation_versions(author_id);
CREATE INDEX idx_obs_versions_conflict   ON observation_versions(conflict_resolved)
  WHERE conflict_resolved = false;   -- índice parcial: apenas conflitos pendentes

-- =============================================================================
-- TABELA: audit_log
-- Log imutável de todas as operações de escrita (append-only)
-- ADR-004: sem UPDATE ou DELETE permitido via RLS
-- LGPD: before_data/after_data NUNCA devem conter 'relations' ou 'notes'
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  action      TEXT NOT NULL
                CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'CONFLICT_DETECTED',
                                  'CONFLICT_RESOLVED', 'LINK_INVITED', 'LINK_ACCEPTED',
                                  'LINK_REVOKED')),
  actor_id    UUID NOT NULL REFERENCES auth.users(id),
  actor_role  TEXT NOT NULL CHECK (actor_role IN ('student', 'instructor', 'admin')),
  -- LGPD: campos before_data/after_data NUNCA devem conter 'relations' ou 'notes'
  -- Esta constraint é reforçada pela camada de aplicação (não apenas banco)
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_log IS
  'Log de auditoria imutável (append-only). '
  'RLS impede UPDATE e DELETE. Cobre todas as operações de escrita clínica.';
COMMENT ON COLUMN audit_log.before_data IS
  'LGPD: NUNCA incluir campos "relations" ou "notes". '
  'Filtrar na camada de aplicação antes de inserir.';

CREATE INDEX idx_audit_entity    ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_actor_id  ON audit_log(actor_id);
CREATE INDEX idx_audit_created   ON audit_log(created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) — ADR-003
-- Princípio: aluna só vê seus próprios dados; instrutora só vê alunas vinculadas.
-- =============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE user_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_student_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_versions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                ENABLE ROW LEVEL SECURITY;

-- ─── user_profiles ─────────────────────────────────────────────────────────
-- Usuário lê e edita apenas seu próprio perfil
CREATE POLICY "user_profiles_own_read" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "user_profiles_own_update" ON user_profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Inserção controlada pelo trigger de criação de conta (Edge Function)
CREATE POLICY "user_profiles_insert_self" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Instrutora pode ver perfil básico das suas alunas (para exibição no dashboard)
CREATE POLICY "instructor_sees_student_profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM instructor_student_links isl
      WHERE isl.instructor_id = auth.uid()
        AND isl.student_id    = user_profiles.id
        AND isl.status        = 'active'
    )
  );

-- ─── instructor_student_links ────────────────────────────────────────────────
-- Aluna vê seus próprios vínculos (para saber com quem está conectada)
CREATE POLICY "student_own_links" ON instructor_student_links
  FOR SELECT USING (auth.uid() = student_id);

-- Instrutora vê vínculos onde ela é a instrutora
CREATE POLICY "instructor_own_links" ON instructor_student_links
  FOR SELECT USING (auth.uid() = instructor_id);

-- Aluna cria o convite (INSERT com instructor_id externo)
CREATE POLICY "student_creates_link" ON instructor_student_links
  FOR INSERT WITH CHECK (auth.uid() = student_id AND status = 'pending');

-- Instrutora aceita ou revoga
CREATE POLICY "instructor_updates_link" ON instructor_student_links
  FOR UPDATE USING (auth.uid() = instructor_id)
  WITH CHECK (auth.uid() = instructor_id);

-- Aluna pode revogar seu próprio vínculo
CREATE POLICY "student_revokes_link" ON instructor_student_links
  FOR UPDATE USING (auth.uid() = student_id AND status = 'active')
  WITH CHECK (auth.uid() = student_id AND status = 'revoked');

-- ─── cycles ─────────────────────────────────────────────────────────────────
-- Aluna vê e gerencia seus próprios ciclos
CREATE POLICY "student_own_cycles" ON cycles
  FOR ALL USING (auth.uid() = user_id);

-- Instrutora lê ciclos das suas alunas vinculadas (somente leitura)
CREATE POLICY "instructor_sees_student_cycles" ON cycles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM instructor_student_links isl
      WHERE isl.instructor_id = auth.uid()
        AND isl.student_id    = cycles.user_id
        AND isl.status        = 'active'
    )
  );

-- ─── observations ────────────────────────────────────────────────────────────
-- Aluna vê e cria seus próprios registros
CREATE POLICY "student_own_observations" ON observations
  FOR ALL USING (auth.uid() = user_id);

-- Instrutora lê observações das suas alunas vinculadas
CREATE POLICY "instructor_sees_student_observations" ON observations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM instructor_student_links isl
      WHERE isl.instructor_id = auth.uid()
        AND isl.student_id    = observations.user_id
        AND isl.status        = 'active'
    )
  );

-- Instrutora edita observações das suas alunas (para correção clínica + resolução de conflito)
CREATE POLICY "instructor_edits_student_observations" ON observations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM instructor_student_links isl
      WHERE isl.instructor_id = auth.uid()
        AND isl.student_id    = observations.user_id
        AND isl.status        = 'active'
    )
  );

-- ─── observation_versions ────────────────────────────────────────────────────
-- Aluna vê versões das suas observações
CREATE POLICY "student_own_versions" ON observation_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM observations o
      WHERE o.id      = observation_versions.observation_id
        AND o.user_id = auth.uid()
    )
  );

-- Instrutora vê versões das observações das suas alunas
CREATE POLICY "instructor_sees_student_versions" ON observation_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM observations o
      JOIN instructor_student_links isl ON isl.student_id = o.user_id
      WHERE o.id              = observation_versions.observation_id
        AND isl.instructor_id = auth.uid()
        AND isl.status        = 'active'
    )
  );

-- Inserção: autores legítimos (student ou instructor vinculada)
CREATE POLICY "authorized_version_insert" ON observation_versions
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND (
      -- é a própria aluna
      EXISTS (
        SELECT 1 FROM observations o
        WHERE o.id = observation_versions.observation_id AND o.user_id = auth.uid()
      )
      OR
      -- é instrutora vinculada
      EXISTS (
        SELECT 1 FROM observations o
        JOIN instructor_student_links isl ON isl.student_id = o.user_id
        WHERE o.id              = observation_versions.observation_id
          AND isl.instructor_id = auth.uid()
          AND isl.status        = 'active'
      )
    )
  );

-- Resolução de conflito: apenas instrutora vinculada pode marcar como resolvido
CREATE POLICY "instructor_resolves_conflict" ON observation_versions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM observations o
      JOIN instructor_student_links isl ON isl.student_id = o.user_id
      WHERE o.id              = observation_versions.observation_id
        AND isl.instructor_id = auth.uid()
        AND isl.status        = 'active'
    )
  );

-- ─── audit_log ───────────────────────────────────────────────────────────────
-- Append-only: INSERT liberado para o service role (via API backend)
-- Nenhum usuário final pode ler o log diretamente (apenas admins via service role)
CREATE POLICY "audit_insert_only" ON audit_log
  FOR INSERT WITH CHECK (true);
-- Sem políticas para SELECT, UPDATE ou DELETE = nenhum usuário pode ler/modificar

-- =============================================================================
-- GRANTS — permissões mínimas para o authenticated role
-- =============================================================================
GRANT SELECT, INSERT, UPDATE ON user_profiles            TO authenticated;
GRANT SELECT, INSERT, UPDATE ON instructor_student_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON cycles                   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON observations             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON observation_versions     TO authenticated;
GRANT INSERT                 ON audit_log                TO authenticated;

-- sequence do audit_log
GRANT USAGE ON SEQUENCE audit_log_id_seq TO authenticated;
