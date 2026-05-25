/**
 * Vector Clock utilities — ADR-004 (CRDT simplificado)
 *
 * A vector clock is a Record<userId, operationCount>.
 * Used to detect concurrent edits between student and instructor.
 *
 * Conflict detection rule:
 *   - A CONFLICT exists when neither clock dominates the other.
 *   - Clock A dominates B when: for every key in B, A[key] >= B[key].
 *   - Concurrent edits => conflict => both versions saved, instructor resolves.
 *
 * LGPD: This module never touches relations or notes fields.
 */

export type VectorClock = Record<string, number>;

/**
 * Returns a new clock with the counter for userId incremented by 1.
 * Pure function — does not mutate the input.
 */
export function incrementVectorClock(clock: VectorClock, userId: string): VectorClock {
  return {
    ...clock,
    [userId]: (clock[userId] ?? 0) + 1,
  };
}

/**
 * Returns true if clock A dominates clock B.
 * A dominates B when every key present in B has A[key] >= B[key].
 * Keys not present in A are treated as 0.
 */
export function dominates(a: VectorClock, b: VectorClock): boolean {
  for (const key of Object.keys(b)) {
    if ((a[key] ?? 0) < b[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true when a conflict exists between clocks a and b.
 * A conflict exists when neither a dominates b nor b dominates a.
 * This means the edits are concurrent (happened in parallel without knowledge of each other).
 */
export function detectConflict(a: VectorClock, b: VectorClock): boolean {
  return !dominates(a, b) && !dominates(b, a);
}

/**
 * Merges two clocks by taking the maximum value for each key.
 * Used when resolving conflicts to produce a merged baseline.
 */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const result: VectorClock = { ...a };
  for (const [key, value] of Object.entries(b)) {
    result[key] = Math.max(result[key] ?? 0, value);
  }
  return result;
}
