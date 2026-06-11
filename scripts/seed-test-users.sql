-- Seed [TEST] users + synthetic cycle data for the UI audit/verification passes.
-- Run via Supabase SQL editor / MCP (postgres role). Idempotent-ish: auth rows
-- use ON CONFLICT DO NOTHING; re-running after cleanup-test-users.sql is the
-- supported reset path (cycles/observations are not conflict-guarded).
--
-- LGPD: synthetic data only; relations=false and notes=NULL on every row.
-- Clinical: stamps restricted to sangramento|seco|muco|apice.
--
-- NOTE (found 2026-06-10): public.uuid_generate_v7() is broken in the live DB
-- (invalid hex->bit cast), so all IDs here are explicit gen_random_uuid() —
-- never rely on column DEFAULTs for cycles/observations/links.
--
-- Password: set <TEST_USER_PASSWORD> below (kept locally in
-- scripts/.test-credentials.env, gitignored).

DO $$
DECLARE
  v_aluna      UUID := 'e2e00000-0000-4000-8000-000000000001';
  v_instrutora UUID := 'e2e00000-0000-4000-8000-000000000002';
  v_pw TEXT := '<TEST_USER_PASSWORD>';
  v_cycle_old UUID := gen_random_uuid();
  v_cycle_new UUID := gen_random_uuid();
  d INT;
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
  VALUES
    ('00000000-0000-0000-0000-000000000000', v_aluna, 'authenticated', 'authenticated',
     'test.aluna@example.com', crypt(v_pw, gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"[TEST] Aluna E2E"}',
     now(), now(), '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_instrutora, 'authenticated', 'authenticated',
     'test.instrutora@example.com', crypt(v_pw, gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"full_name":"[TEST] Instrutora E2E"}',
     now(), now(), '', '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_aluna, v_aluna::text,
     jsonb_build_object('sub', v_aluna::text, 'email', 'test.aluna@example.com', 'email_verified', true),
     'email', now(), now(), now()),
    (gen_random_uuid(), v_instrutora, v_instrutora::text,
     jsonb_build_object('sub', v_instrutora::text, 'email', 'test.instrutora@example.com', 'email_verified', true),
     'email', now(), now(), now())
  ON CONFLICT (provider_id, provider) DO NOTHING;

  -- The on_auth_user_created trigger (migration 20260531000010) is MISSING in
  -- the live DB as of 2026-06-10, so profiles are inserted explicitly.
  INSERT INTO public.user_profiles (id, role, full_name, cenplafam_id)
  VALUES
    (v_aluna, 'student', '[TEST] Aluna E2E', NULL),
    (v_instrutora, 'instructor', '[TEST] Instrutora E2E', 'TEST-0000')
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role, full_name = EXCLUDED.full_name, cenplafam_id = EXCLUDED.cenplafam_id;

  INSERT INTO public.instructor_student_links (id, instructor_id, student_id, status, invited_at, accepted_at)
  VALUES (gen_random_uuid(), v_instrutora, v_aluna, 'active', now() - interval '30 days', now() - interval '29 days')
  ON CONFLICT (instructor_id, student_id) DO NOTHING;

  -- Archived cycle: 28 days, ended 13 days ago; apice on day 15
  INSERT INTO public.cycles (id, user_id, start_date, end_date, apex_date, status)
  VALUES (v_cycle_old, v_aluna, CURRENT_DATE - 40, CURRENT_DATE - 13, CURRENT_DATE - 26, 'archived');

  FOR d IN 1..28 LOOP
    INSERT INTO public.observations
      (id, user_id, cycle_id, date, stamp, mucus, bleeding, sensacao, tipo_observacao, relations, notes, vector_clock)
    VALUES (
      gen_random_uuid(), v_aluna, v_cycle_old, CURRENT_DATE - 41 + d,
      CASE WHEN d <= 5 THEN 'sangramento' WHEN d <= 10 THEN 'seco'
           WHEN d < 15 THEN 'muco' WHEN d = 15 THEN 'apice' ELSE 'seco' END,
      CASE WHEN d BETWEEN 11 AND 12 THEN 'cremoso' WHEN d BETWEEN 13 AND 14 THEN 'transparente'
           WHEN d = 15 THEN 'elastico' ELSE NULL END,
      CASE WHEN d = 1 THEN 'intenso' WHEN d <= 3 THEN 'moderado' WHEN d = 4 THEN 'leve'
           WHEN d = 5 THEN 'manchas' ELSE NULL END,
      CASE WHEN d <= 5 THEN NULL WHEN d <= 10 THEN 'seca' WHEN d <= 13 THEN 'molhada'
           WHEN d <= 15 THEN 'lubrificante' ELSE 'seca' END,
      CASE WHEN d <= 4 THEN 'sangue' WHEN d = 5 THEN 'manchas' ELSE NULL END,
      false, NULL, jsonb_build_object(v_aluna::text, d)
    );
  END LOOP;

  -- Active cycle: started 12 days ago, includes an observation for today
  INSERT INTO public.cycles (id, user_id, start_date, status)
  VALUES (v_cycle_new, v_aluna, CURRENT_DATE - 12, 'active');

  FOR d IN 1..13 LOOP
    INSERT INTO public.observations
      (id, user_id, cycle_id, date, stamp, mucus, bleeding, sensacao, tipo_observacao, relations, notes, vector_clock)
    VALUES (
      gen_random_uuid(), v_aluna, v_cycle_new, CURRENT_DATE - 13 + d,
      CASE WHEN d <= 5 THEN 'sangramento' WHEN d <= 8 THEN 'seco'
           WHEN d < 12 THEN 'muco' WHEN d = 12 THEN 'apice' ELSE 'seco' END,
      CASE WHEN d = 9 THEN 'opaco' WHEN d = 10 THEN 'cremoso' WHEN d = 11 THEN 'transparente'
           WHEN d = 12 THEN 'elastico' ELSE NULL END,
      CASE WHEN d = 1 THEN 'moderado' WHEN d <= 3 THEN 'intenso' WHEN d = 4 THEN 'leve'
           WHEN d = 5 THEN 'manchas' ELSE NULL END,
      CASE WHEN d <= 5 THEN NULL WHEN d <= 8 THEN 'seca' WHEN d <= 10 THEN 'molhada'
           WHEN d <= 12 THEN 'lubrificante' ELSE 'seca' END,
      CASE WHEN d <= 4 THEN 'sangue' WHEN d = 5 THEN 'manchas' ELSE NULL END,
      false, NULL, jsonb_build_object(v_aluna::text, d)
    );
  END LOOP;
END $$;
