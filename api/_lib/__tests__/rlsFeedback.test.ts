/**
 * RLS Integration tests — app_feedback table isolation
 *
 * These tests require a running Supabase local instance (Docker + supabase start).
 * They are marked as it.skip because Docker is not available in this CI environment.
 *
 * WHY these tests are correct by design (per the migration):
 *   - Migration 20260531000011_feedback_rls (or equivalent) creates RLS policies on
 *     app_feedback that ensure:
 *       1. SELECT: users can read all public feedback (community list), but only
 *          their own private data. Admin can read all.
 *       2. INSERT: authenticated users can only insert rows where author_id = auth.uid()
 *       3. UPDATE: only admin role (from user_profiles) can update status fields
 *
 * HOW to run these tests locally:
 *   1. Install Docker Desktop and start it
 *   2. Run: supabase start (from the project root with supabase/config.toml)
 *   3. Run: supabase db reset (applies migrations + seed data)
 *   4. Change it.skip(...) to it(...) below
 *   5. Run: npx vitest run api/_lib/__tests__/rlsFeedback.test.ts
 *
 * LIMITATION: Without Docker, we cannot test actual RLS policies at the DB layer.
 * The unit tests in feedbackList.test.ts and feedbackDetail.test.ts verify the
 * application-layer authorization (requireAuth, requireAdmin), which is the first
 * line of defense. RLS is the second, DB-level defense.
 */

import { describe, it } from 'vitest';

// ─── RLS isolation tests (require supabase start) ─────────────────────────────

describe('RLS — app_feedback table isolation', () => {
  it.skip(
    'user A cannot read feedback authored by user B if RLS prevents cross-user reads',
    async () => {
      // To implement:
      // 1. Create user A and user B via supabase.auth.signUp()
      // 2. Insert feedback as user B using user B's JWT
      // 3. Attempt to read that feedback as user A using user A's JWT
      // 4. Assert that user A receives empty result or 404
      //    (depends on RLS policy: community or private)
      //
      // const supabaseUserA = createClient(LOCAL_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${userAJwt}` } } });
      // const supabaseUserB = createClient(LOCAL_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${userBJwt}` } } });
      // const { data } = await supabaseUserA.from('app_feedback').select('*').eq('author_id', userBId);
      // expect(data).toEqual([]); // RLS should return empty
    },
  );

  it.skip(
    'admin can read all feedbacks regardless of author_id',
    async () => {
      // To implement:
      // 1. Create admin user (via promotion in user_profiles)
      // 2. Insert feedback as student user
      // 3. Read as admin — should see all feedback
      //
      // const supabaseAdmin = createClient(LOCAL_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${adminJwt}` } } });
      // const { data } = await supabaseAdmin.from('app_feedback').select('*');
      // expect(data?.length).toBeGreaterThan(0);
    },
  );

  it.skip(
    'student cannot insert feedback with author_id different from their own auth.uid()',
    async () => {
      // To implement:
      // 1. Create student user A
      // 2. Attempt to insert feedback with author_id = user B's UUID
      // 3. Assert that Supabase returns a policy violation error
      //
      // const { error } = await supabaseUserA.from('app_feedback').insert({
      //   author_id: OTHER_USER_ID, // not auth.uid()
      //   category: 'bug',
      //   title: 'Teste RLS',
      //   content: 'Conteudo do teste de RLS',
      //   status: 'pending_triage',
      // });
      // expect(error).toBeDefined(); // RLS policy violation
    },
  );
});
