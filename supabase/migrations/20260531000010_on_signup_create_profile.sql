-- Migration: 20260531000010_on_signup_create_profile.sql
-- Sprint 5 SEC-003: create user_profiles with role='student' on every new auth.users row.
--
-- Threat mitigated: privilege escalation via user_metadata.role
-- Previously, requireAuth read role from user.user_metadata?.role (JWT claim),
-- which Supabase Auth allows users to set during sign-up. A malicious user could
-- set role:'instructor' in user_metadata and pass authorization checks in
-- /api/observations/versions and /api/instructor-student-links/pending.
--
-- Fix: role is now always written server-side by this trigger (SECURITY DEFINER),
-- defaulting to 'student'. Promotion to 'instructor' or 'admin' must be performed
-- by a privileged operator directly in user_profiles — never via client input.
--
-- STRIDE: Elevation of Privilege (CVSS 8.8 — High, mitigated to Low post-fix)
-- LGPD: user_profiles is RLS-protected; users can only read their own row.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, role, full_name)
  VALUES (
    NEW.id,
    'student',  -- role always defaults to student; instructors are promoted manually by operators
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- DOWN --
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS handle_new_user();
