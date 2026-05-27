// @vitest-environment jsdom
/**
 * Tests for client-side vector clock utilities.
 *
 * Covers:
 *  - incrementVectorClock: creates and increments per-user counters
 *  - dominates: correct dominance relation between clocks
 *  - mergeVectorClocks: takes max of each key
 *  - loadObservationClock / saveObservationClock: localStorage persistence
 *  - tickAndSaveClock: increments and persists in one step
 *  - mergeServerClock: merges server clock into local storage
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  incrementVectorClock,
  dominates,
  mergeVectorClocks,
  loadObservationClock,
  saveObservationClock,
  tickAndSaveClock,
  mergeServerClock,
} from '../vectorClock';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('incrementVectorClock', () => {
  it('creates entry for new userId starting at 1', () => {
    const result = incrementVectorClock({}, 'user-a');
    expect(result).toEqual({ 'user-a': 1 });
  });

  it('increments existing userId counter', () => {
    const result = incrementVectorClock({ 'user-a': 3 }, 'user-a');
    expect(result).toEqual({ 'user-a': 4 });
  });

  it('does not mutate the input clock', () => {
    const clock = { 'user-a': 1 };
    incrementVectorClock(clock, 'user-a');
    expect(clock).toEqual({ 'user-a': 1 });
  });

  it('preserves other user entries unchanged', () => {
    const result = incrementVectorClock({ 'user-a': 2, 'user-b': 5 }, 'user-a');
    expect(result['user-b']).toBe(5);
  });
});

describe('dominates', () => {
  it('returns true when a dominates b (all values >=)', () => {
    expect(dominates({ a: 3, b: 2 }, { a: 2, b: 1 })).toBe(true);
  });

  it('returns true when clocks are equal', () => {
    expect(dominates({ a: 2 }, { a: 2 })).toBe(true);
  });

  it('returns false when a is behind on any key', () => {
    expect(dominates({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('returns false when b has keys a does not have', () => {
    expect(dominates({ a: 1 }, { a: 1, b: 1 })).toBe(false);
  });

  it('returns true for empty clocks', () => {
    expect(dominates({}, {})).toBe(true);
  });
});

describe('mergeVectorClocks', () => {
  it('takes the max of each key', () => {
    const result = mergeVectorClocks({ a: 3, b: 1 }, { a: 1, b: 5 });
    expect(result).toEqual({ a: 3, b: 5 });
  });

  it('includes keys only in a', () => {
    const result = mergeVectorClocks({ a: 2 }, { b: 3 });
    expect(result).toEqual({ a: 2, b: 3 });
  });

  it('handles empty clocks', () => {
    expect(mergeVectorClocks({}, { a: 1 })).toEqual({ a: 1 });
    expect(mergeVectorClocks({ a: 1 }, {})).toEqual({ a: 1 });
  });
});

describe('localStorage persistence', () => {
  it('loadObservationClock returns empty clock for unknown observation', () => {
    expect(loadObservationClock('obs-unknown')).toEqual({});
  });

  it('saveObservationClock and loadObservationClock round-trip', () => {
    const clock = { 'user-123': 5, 'user-456': 2 };
    saveObservationClock('obs-abc', clock);
    expect(loadObservationClock('obs-abc')).toEqual(clock);
  });

  it('saves to separate keys per observation', () => {
    saveObservationClock('obs-1', { a: 1 });
    saveObservationClock('obs-2', { a: 2 });
    expect(loadObservationClock('obs-1')).toEqual({ a: 1 });
    expect(loadObservationClock('obs-2')).toEqual({ a: 2 });
  });
});

describe('tickAndSaveClock', () => {
  it('increments and persists the clock in one call', () => {
    const result = tickAndSaveClock('obs-tick', 'user-x');
    expect(result).toEqual({ 'user-x': 1 });
    expect(loadObservationClock('obs-tick')).toEqual({ 'user-x': 1 });
  });

  it('accumulates multiple ticks', () => {
    tickAndSaveClock('obs-multi', 'user-y');
    tickAndSaveClock('obs-multi', 'user-y');
    const result = tickAndSaveClock('obs-multi', 'user-y');
    expect(result).toEqual({ 'user-y': 3 });
  });

  it('increments independently per user', () => {
    tickAndSaveClock('obs-z', 'user-a');
    tickAndSaveClock('obs-z', 'user-b');
    const clock = loadObservationClock('obs-z');
    expect(clock).toEqual({ 'user-a': 1, 'user-b': 1 });
  });
});

describe('mergeServerClock', () => {
  it('merges server clock with empty local clock', () => {
    const result = mergeServerClock('obs-merge', { 'server-user': 10 });
    expect(result).toEqual({ 'server-user': 10 });
    expect(loadObservationClock('obs-merge')).toEqual({ 'server-user': 10 });
  });

  it('takes max when server has higher value', () => {
    saveObservationClock('obs-m2', { 'user-a': 3 });
    const result = mergeServerClock('obs-m2', { 'user-a': 5 });
    expect(result['user-a']).toBe(5);
  });

  it('keeps local value when local has higher value', () => {
    saveObservationClock('obs-m3', { 'user-a': 7 });
    const result = mergeServerClock('obs-m3', { 'user-a': 2 });
    expect(result['user-a']).toBe(7);
  });
});
