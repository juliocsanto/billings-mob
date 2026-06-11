-- Cleanup the [TEST] UI-audit users and all their synthetic data.
-- auth.users ON DELETE CASCADE removes: user_profiles, instructor_student_links,
-- cycles, observations (and observation_versions via observations).
-- audit_log rows reference actor_id with NO cascade — none are written by the
-- seed (direct SQL), but if the test accounts were used through the API, delete
-- those rows first.

DELETE FROM public.audit_log
WHERE actor_id IN ('e2e00000-0000-4000-8000-000000000001',
                   'e2e00000-0000-4000-8000-000000000002');

DELETE FROM auth.users
WHERE id IN ('e2e00000-0000-4000-8000-000000000001',
             'e2e00000-0000-4000-8000-000000000002');
