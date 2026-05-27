/**
 * Vector Clock utilities — client-side (ADR-004 CRDT)
 *
 * Mirrors the server-side implementation in api/_lib/vectorClock.ts.
 * Used by the PWA to track local edits and send client_vector_clock
 * in PATCH /api/observations/:id requests.
 *
 * Design:
 *   - The clock is stored per-observation in localStorage alongside obs data.
 *   - On each local save, the user's entry in the clock is incremented.
 *   - On sync, the client sends its clock; server detects conflicts.
 *   - On receiving a response that includes the server's updated clock,
 *     the client merges it (takes the max per key).
 *
 * LGPD: This module never touches relations or notes fields.
 * Clinical constraint: never interprets the cycle as fertile or infertile.
 */

export type VectorClock = Record<string, number>;

const CLOCK_STORAGE_PREFIX = 'billings-vc-';

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
 * A dominates B when every key in B has A[key] >= B[key].
 */
export function dominates(a: VectorClock, b: VectorClock): boolean {
  for (const key of Object.keys(b)) {
    if ((a[key] ?? 0) < b[key]) return false;
  }
  return true;
}

/**
 * Merges two clocks by taking the maximum value for each key.
 * Used after receiving an updated clock from the server.
 */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const result: VectorClock = { ...a };
  for (const [key, value] of Object.entries(b)) {
    result[key] = Math.max(result[key] ?? 0, value);
  }
  return result;
}

// ── Persistence helpers ───────────────────────────────────────────────────────

/**
 * Loads the stored vector clock for a given observation ID.
 * Returns an empty clock if none is stored.
 */
export function loadObservationClock(observationId: string): VectorClock {
  try {
    const raw = localStorage.getItem(`${CLOCK_STORAGE_PREFIX}${observationId}`);
    return raw ? (JSON.parse(raw) as VectorClock) : {};
  } catch {
    return {};
  }
}

/**
 * Persists the vector clock for a given observation ID.
 */
export function saveObservationClock(observationId: string, clock: VectorClock): void {
  try {
    localStorage.setItem(`${CLOCK_STORAGE_PREFIX}${observationId}`, JSON.stringify(clock));
  } catch {
    // Storage quota exceeded — clock is lost but observation data is preserved
  }
}

/**
 * Increments the user's entry in the stored clock for an observation
 * and persists the result. Returns the new clock.
 *
 * Call this BEFORE sending a PATCH request to ensure the client_vector_clock
 * in the request body represents the state after the local edit.
 */
export function tickAndSaveClock(observationId: string, userId: string): VectorClock {
  const current = loadObservationClock(observationId);
  const updated = incrementVectorClock(current, userId);
  saveObservationClock(observationId, updated);
  return updated;
}

/**
 * Merges a server-returned clock into the locally stored clock for an observation.
 * Call this after a successful PATCH response that includes the server's vector_clock.
 */
export function mergeServerClock(observationId: string, serverClock: VectorClock): VectorClock {
  const local = loadObservationClock(observationId);
  const merged = mergeVectorClocks(local, serverClock);
  saveObservationClock(observationId, merged);
  return merged;
}
