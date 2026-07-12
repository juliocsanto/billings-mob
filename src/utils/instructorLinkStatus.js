/**
 * deriveInstructorLinkStatus — pure helper mapping a student's instructor links
 * to a single navigable status the UI can use for nudges.
 *
 *   'active'  → at least one accepted link (the aluna has an instructor)
 *   'pending' → an invite was sent, awaiting the instructor's acceptance
 *   'none'    → no active or pending link (revoked-only counts as 'none')
 *
 * Mirrors the server-side `deriveLinkStatus` in
 * api/instructor-student-links/index.ts so client and API agree.
 *
 * Clinical: contains no fertility inference. LGPD: reads only the `status` field.
 *
 * @param {Array<{ status?: string }> | null | undefined} links
 * @returns {'none' | 'pending' | 'active'}
 */
export function deriveInstructorLinkStatus(links) {
  if (!Array.isArray(links) || links.length === 0) return 'none';
  if (links.some((l) => l && l.status === 'active')) return 'active';
  if (links.some((l) => l && l.status === 'pending')) return 'pending';
  return 'none';
}
