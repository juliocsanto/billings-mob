/**
 * TDD — RED phase: Vector Clock logic tests
 * Sprint 1 — ADR-004 (CRDT simplificado)
 *
 * Rules under test:
 *   1. increment(clock, userId) increments the counter for userId
 *   2. detectConflict(a, b) returns true when neither dominates the other
 *   3. dominates(a, b) returns true when every key in b is >= in a
 */
import { describe, it, expect } from 'vitest';
import { incrementVectorClock, detectConflict, dominates } from '../vectorClock';

describe('incrementVectorClock', () => {
  it('creates entry for new userId', () => {
    const result = incrementVectorClock({}, 'user-A');
    expect(result).toEqual({ 'user-A': 1 });
  });

  it('increments existing userId counter', () => {
    const result = incrementVectorClock({ 'user-A': 2 }, 'user-A');
    expect(result).toEqual({ 'user-A': 3 });
  });

  it('does not mutate the original clock', () => {
    const original = { 'user-A': 1 };
    incrementVectorClock(original, 'user-A');
    expect(original).toEqual({ 'user-A': 1 });
  });

  it('preserves other entries unchanged', () => {
    const result = incrementVectorClock({ 'user-A': 1, 'user-I': 2 }, 'user-A');
    expect(result).toEqual({ 'user-A': 2, 'user-I': 2 });
  });
});

describe('dominates', () => {
  it('returns true when a dominates b (all values >=)', () => {
    expect(dominates({ 'A': 2 }, { 'A': 1 })).toBe(true);
  });

  it('returns true when clocks are equal', () => {
    expect(dominates({ 'A': 1 }, { 'A': 1 })).toBe(true);
  });

  it('returns false when a is behind on any key', () => {
    expect(dominates({ 'A': 1 }, { 'A': 2 })).toBe(false);
  });

  it('returns false when b has keys a does not have', () => {
    // a = { A:2 }, b = { A:1, I:1 } -> a does not have I -> treats as 0
    expect(dominates({ 'A': 2 }, { 'A': 1, 'I': 1 })).toBe(false);
  });

  it('returns true for empty clocks', () => {
    expect(dominates({}, {})).toBe(true);
  });
});

describe('detectConflict', () => {
  it('returns false when a strictly dominates b', () => {
    // A = { A:2 }, B = { A:1 } -> A dominates B, no conflict
    expect(detectConflict({ 'A': 2 }, { 'A': 1 })).toBe(false);
  });

  it('returns false when b strictly dominates a', () => {
    expect(detectConflict({ 'A': 1 }, { 'A': 2 })).toBe(false);
  });

  it('returns false when clocks are equal (same edit)', () => {
    expect(detectConflict({ 'A': 1 }, { 'A': 1 })).toBe(false);
  });

  it('returns true when neither dominates the other (concurrent edits)', () => {
    // Student saved v2 ({ A:2 }), instructor edited from v1 ({ A:1, I:1 })
    // Neither vector dominates -> CONFLICT
    expect(detectConflict({ 'A': 2 }, { 'A': 1, 'I': 1 })).toBe(true);
  });

  it('returns true for symmetric concurrent edits', () => {
    expect(detectConflict({ 'A': 1, 'I': 0 }, { 'A': 0, 'I': 1 })).toBe(true);
  });
});
