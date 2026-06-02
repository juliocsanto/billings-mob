-- Migration: add observacao_descricao column to observations table
-- Feature: free-text clinical description field for sangramento stamp
-- Not LGPD-sensitive (clinical physical observation, not relational data)
--
-- UP

ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS observacao_descricao text
  CHECK (char_length(observacao_descricao) <= 500);

-- DOWN
-- ALTER TABLE observations DROP COLUMN IF EXISTS observacao_descricao;
