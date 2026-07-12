// @vitest-environment node
/**
 * Unit tests for src/utils/streak.js — daily registration streak helpers.
 *
 * TDD RED phase: these tests are written BEFORE the implementation.
 *
 * Clinical constraint: streak is a neutral behavioral count — no fertile/
 * infertile/safe/unsafe language, no cycle interpretation.
 */
import { describe, it, expect } from 'vitest';
import {
  computeStreak,
  hasRecordedToday,
  missedYesterday,
} from '../streak.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a sparse obs object from a list of date strings that have records.
 * Each date gets a minimal stub — streak only cares about key presence.
 */
function obsFromDates(dates) {
  return Object.fromEntries(dates.map((d) => [d, { stamp: 'seco' }]));
}

// ── computeStreak ─────────────────────────────────────────────────────────────

describe('computeStreak', () => {
  it('returns 0 for empty obs', () => {
    expect(computeStreak({}, '2026-07-11')).toBe(0);
  });

  it('returns 0 when no obs at all', () => {
    expect(computeStreak(null, '2026-07-11')).toBe(0);
  });

  it('returns 1 when only today is recorded', () => {
    const obs = obsFromDates(['2026-07-11']);
    expect(computeStreak(obs, '2026-07-11')).toBe(1);
  });

  it('returns 1 when only yesterday is recorded (today not yet recorded — streak still alive)', () => {
    const obs = obsFromDates(['2026-07-10']);
    expect(computeStreak(obs, '2026-07-11')).toBe(1);
  });

  it('returns 0 when yesterday is missing and today is also missing', () => {
    // last recorded day was 2 days ago — streak is broken
    const obs = obsFromDates(['2026-07-09']);
    expect(computeStreak(obs, '2026-07-11')).toBe(0);
  });

  it('counts consecutive days ending at today (today is recorded)', () => {
    const obs = obsFromDates(['2026-07-09', '2026-07-10', '2026-07-11']);
    expect(computeStreak(obs, '2026-07-11')).toBe(3);
  });

  it('counts consecutive days ending at yesterday (today not yet recorded)', () => {
    const obs = obsFromDates(['2026-07-09', '2026-07-10']);
    expect(computeStreak(obs, '2026-07-11')).toBe(2);
  });

  it('stops at a gap — only counts most recent consecutive run', () => {
    // 3 days gap between first block and second block
    const obs = obsFromDates([
      '2026-07-01', '2026-07-02',          // old block (broken)
      '2026-07-08', '2026-07-09', '2026-07-10', // current streak
    ]);
    expect(computeStreak(obs, '2026-07-11')).toBe(3);
  });

  it('returns the full length for a long unbroken run', () => {
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date('2026-06-12T12:00:00');
      d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    });
    const obs = obsFromDates(dates);
    expect(computeStreak(obs, '2026-07-11')).toBe(30);
  });

  it('does NOT include fertility language in any output (clinical constraint)', () => {
    const obs = obsFromDates(['2026-07-10', '2026-07-11']);
    const result = String(computeStreak(obs, '2026-07-11'));
    expect(result).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });
});

// ── hasRecordedToday ──────────────────────────────────────────────────────────

describe('hasRecordedToday', () => {
  it('returns false for empty obs', () => {
    expect(hasRecordedToday({}, '2026-07-11')).toBe(false);
  });

  it('returns true when todayStr is a key in obs', () => {
    const obs = obsFromDates(['2026-07-11']);
    expect(hasRecordedToday(obs, '2026-07-11')).toBe(true);
  });

  it('returns false when todayStr is NOT in obs', () => {
    const obs = obsFromDates(['2026-07-10']);
    expect(hasRecordedToday(obs, '2026-07-11')).toBe(false);
  });

  it('returns false for null obs', () => {
    expect(hasRecordedToday(null, '2026-07-11')).toBe(false);
  });
});

// ── missedYesterday ───────────────────────────────────────────────────────────

describe('missedYesterday', () => {
  it('returns true when yesterday is missing from obs', () => {
    const obs = obsFromDates(['2026-07-09']); // two days ago only
    expect(missedYesterday(obs, '2026-07-11')).toBe(true);
  });

  it('returns false when yesterday IS in obs', () => {
    const obs = obsFromDates(['2026-07-10']);
    expect(missedYesterday(obs, '2026-07-11')).toBe(false);
  });

  it('returns true for empty obs', () => {
    expect(missedYesterday({}, '2026-07-11')).toBe(true);
  });

  it('returns true for null obs', () => {
    expect(missedYesterday(null, '2026-07-11')).toBe(true);
  });

  it('today recorded does not count as yesterday', () => {
    const obs = obsFromDates(['2026-07-11']); // today only, no yesterday
    expect(missedYesterday(obs, '2026-07-11')).toBe(true);
  });
});
