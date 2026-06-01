-- =============================================================================
-- Migração: sensacao + tipo_observacao em observations
--
-- Feedback clínico (2026-06-01): separar sensação vulvar e tipo de secreção
-- como campos independentes, combináveis com qualquer stamp.
-- =============================================================================

ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS sensacao        TEXT CHECK (sensacao IN ('seca','molhada','lubrificante')),
  ADD COLUMN IF NOT EXISTS tipo_observacao TEXT CHECK (tipo_observacao IN ('sangue','manchas','outro'));

COMMENT ON COLUMN observations.sensacao IS
  'Sensação vulvar registrada pela aluna: seca | molhada | lubrificante. '
  'Campo clínico — não é dado sensível LGPD.';
COMMENT ON COLUMN observations.tipo_observacao IS
  'O que a aluna observa no sangramento: sangue | manchas | outro. '
  'Aplicável apenas quando stamp = ''sangramento''.';
