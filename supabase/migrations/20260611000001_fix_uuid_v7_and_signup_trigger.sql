-- =============================================================================
-- Migration: 20260611000001_fix_uuid_v7_and_signup_trigger.sql
-- Hotfix for live-DB drift found during the 2026-06 UI audit (finding C-4):
--
-- 1) public.uuid_generate_v7() threw `22P02: "X" is not a valid binary digit`
--    on essentially every call — the original implementation concatenated HEX
--    strings and cast them to BIT(64). Every INSERT relying on a column
--    DEFAULT (cycles, observations, instructor_student_links,
--    observation_versions) failed with 500.
--    Fix: byte-level UUIDv7 (RFC 9562) via set_byte over gen_random_bytes(16).
--
-- 2) The on_auth_user_created trigger (SEC-003 privilege-escalation
--    mitigation, migration 20260531000010) was missing in the live database.
--    Re-created idempotently below.
-- =============================================================================

-- ── 1. uuid_generate_v7 — correct byte-level implementation ─────────────────
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_bytes BYTEA;
  v_unix_ms BIGINT;
BEGIN
  v_unix_ms := floor(extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_bytes := gen_random_bytes(16);

  -- 48-bit big-endian unix-ms timestamp in bytes 0..5
  v_bytes := set_byte(v_bytes, 0, ((v_unix_ms >> 40) & 255)::INT);
  v_bytes := set_byte(v_bytes, 1, ((v_unix_ms >> 32) & 255)::INT);
  v_bytes := set_byte(v_bytes, 2, ((v_unix_ms >> 24) & 255)::INT);
  v_bytes := set_byte(v_bytes, 3, ((v_unix_ms >> 16) & 255)::INT);
  v_bytes := set_byte(v_bytes, 4, ((v_unix_ms >> 8) & 255)::INT);
  v_bytes := set_byte(v_bytes, 5, (v_unix_ms & 255)::INT);

  -- version 7 (0111) in the high nibble of byte 6
  v_bytes := set_byte(v_bytes, 6, ((get_byte(v_bytes, 6) & 15) | 112));
  -- RFC 4122 variant (10) in the two high bits of byte 8
  v_bytes := set_byte(v_bytes, 8, ((get_byte(v_bytes, 8) & 63) | 128));

  RETURN encode(v_bytes, 'hex')::UUID;
END;
$$;

-- ── 2. SEC-003 signup trigger — re-create (idempotent) ──────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, role, full_name)
  VALUES (
    NEW.id,
    'student',  -- role always defaults to student; instructors are promoted manually by operators
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuária')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
