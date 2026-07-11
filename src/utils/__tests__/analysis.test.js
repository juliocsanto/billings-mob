// @vitest-environment node
/**
 * Unit tests for src/utils/analysis.js — getCycleLengthStdDev & getCycleLengthsForTrend.
 *
 * TDD RED phase: written BEFORE implementation.
 *
 * Clinical constraint: these are neutral arithmetic helpers on recorded cycle
 * durations — no fertility classification, no prediction, no interpretation.
 */
import { describe, it, expect } from 'vitest';
import { getCycleLengthStdDev, getCycleLengthsForTrend } from '../analysis.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal cycle object with obs entries at start and end so that
 * getCycleLength() returns `lengthDays` (first obs + last obs span).
 */
function makeCycle(startDate, lengthDays) {
  const obs = {};
  obs[startDate] = { stamp: 'sangramento' };
  // compute end date without importing addDays — manual arithmetic
  const end = new Date(startDate + 'T12:00:00');
  end.setDate(end.getDate() + lengthDays - 1);
  const endStr = end.toISOString().split('T')[0];
  obs[endStr] = { stamp: 'seco' };
  return { start: startDate, obs };
}

// ── getCycleLengthStdDev ──────────────────────────────────────────────────────

describe('getCycleLengthStdDev', () => {
  it('returns null for null input', () => {
    expect(getCycleLengthStdDev(null)).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(getCycleLengthStdDev([])).toBeNull();
  });

  it('returns null for a single cycle (need >= 2)', () => {
    const cycle = makeCycle('2026-01-01', 28);
    expect(getCycleLengthStdDev([cycle])).toBeNull();
  });

  it('returns 0 for two cycles with the same length', () => {
    const c1 = makeCycle('2026-01-01', 28);
    const c2 = makeCycle('2026-02-01', 28);
    expect(getCycleLengthStdDev([c1, c2])).toBe(0);
  });

  it('computes correct std dev for two cycles', () => {
    // lengths [26, 30] — mean 28, variance (4+4)/2=4, stdDev=2
    const c1 = makeCycle('2026-01-01', 26);
    const c2 = makeCycle('2026-02-01', 30);
    expect(getCycleLengthStdDev([c1, c2])).toBe(2);
  });

  it('computes correct std dev for three cycles', () => {
    // lengths [26, 28, 30] — mean 28, variance (4+0+4)/3 ≈ 2.667, stdDev ≈ 1.6
    const c1 = makeCycle('2026-01-01', 26);
    const c2 = makeCycle('2026-02-01', 28);
    const c3 = makeCycle('2026-03-01', 30);
    const result = getCycleLengthStdDev([c1, c2, c3]);
    // sqrt(8/3) ≈ 1.633, rounded to 1 decimal → 1.6
    expect(result).toBe(1.6);
  });

  it('returns a non-negative number', () => {
    const c1 = makeCycle('2026-01-01', 27);
    const c2 = makeCycle('2026-02-01', 31);
    const c3 = makeCycle('2026-03-01', 29);
    expect(getCycleLengthStdDev([c1, c2, c3])).toBeGreaterThanOrEqual(0);
  });

  it('never returns a fertility classification (clinical constraint)', () => {
    const c1 = makeCycle('2026-01-01', 28);
    const c2 = makeCycle('2026-02-01', 30);
    const result = String(getCycleLengthStdDev([c1, c2]));
    expect(result).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });
});

// ── getCycleLengthsForTrend ───────────────────────────────────────────────────

describe('getCycleLengthsForTrend', () => {
  it('returns [] for null input', () => {
    expect(getCycleLengthsForTrend(null)).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(getCycleLengthsForTrend([])).toEqual([]);
  });

  it('returns one entry for a single cycle', () => {
    const c = makeCycle('2026-01-01', 28);
    expect(getCycleLengthsForTrend([c])).toEqual([{ index: 1, length: 28 }]);
  });

  it('returns correct index and length for multiple cycles', () => {
    const c1 = makeCycle('2026-01-01', 26);
    const c2 = makeCycle('2026-02-01', 28);
    const c3 = makeCycle('2026-03-01', 30);
    expect(getCycleLengthsForTrend([c1, c2, c3])).toEqual([
      { index: 1, length: 26 },
      { index: 2, length: 28 },
      { index: 3, length: 30 },
    ]);
  });

  it('skips cycles that have no computable length (empty obs)', () => {
    const empty = { start: '2026-01-01', obs: {} };
    const c2 = makeCycle('2026-02-01', 28);
    const result = getCycleLengthsForTrend([empty, c2]);
    // empty cycle has no obs entries → getCycleLength returns null → skip
    expect(result).toEqual([{ index: 2, length: 28 }]);
  });

  it('preserves order (oldest first)', () => {
    const c1 = makeCycle('2026-01-01', 30);
    const c2 = makeCycle('2026-02-01', 26);
    const result = getCycleLengthsForTrend([c1, c2]);
    expect(result[0].length).toBe(30);
    expect(result[1].length).toBe(26);
  });
});
