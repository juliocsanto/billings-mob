/**
 * TDD — Unit tests: Cycle Zod schema validation
 * Sprint 1 — ADR-002 (Hono.js + Zod)
 *
 * Tests CreateCycleSchema and PatchCycleSchema validation rules.
 */
import { describe, it, expect } from 'vitest';
import { CreateCycleSchema, PatchCycleSchema } from '../schema';

describe('CreateCycleSchema', () => {
  it('accepts a valid cycle with start_date only', () => {
    expect(() => CreateCycleSchema.parse({ start_date: '2026-05-01' })).not.toThrow();
  });

  it('accepts a cycle with start_date and end_date', () => {
    expect(() =>
      CreateCycleSchema.parse({ start_date: '2026-05-01', end_date: '2026-05-28' })
    ).not.toThrow();
  });

  it('accepts a cycle with apex_date', () => {
    expect(() =>
      CreateCycleSchema.parse({
        start_date: '2026-05-01',
        end_date: '2026-05-28',
        apex_date: '2026-05-14',
      })
    ).not.toThrow();
  });

  it('rejects invalid date format', () => {
    expect(() => CreateCycleSchema.parse({ start_date: '01/05/2026' })).toThrow();
    expect(() => CreateCycleSchema.parse({ start_date: '2026-13-01' })).toThrow();
  });

  it('requires start_date', () => {
    expect(() => CreateCycleSchema.parse({})).toThrow();
  });

  it('accepts null end_date (open cycle)', () => {
    expect(() =>
      CreateCycleSchema.parse({ start_date: '2026-05-01', end_date: null })
    ).not.toThrow();
  });
});

describe('PatchCycleSchema', () => {
  it('accepts partial update with status', () => {
    expect(() => PatchCycleSchema.parse({ status: 'archived' })).not.toThrow();
  });

  it('accepts update with end_date', () => {
    expect(() => PatchCycleSchema.parse({ end_date: '2026-05-28' })).not.toThrow();
  });

  it('accepts update with apex_date', () => {
    expect(() => PatchCycleSchema.parse({ apex_date: '2026-05-14' })).not.toThrow();
  });

  it('rejects empty patch (nothing to update)', () => {
    expect(() => PatchCycleSchema.parse({})).toThrow();
  });

  it('rejects invalid status value', () => {
    expect(() => PatchCycleSchema.parse({ status: 'pending' })).toThrow();
  });

  it('rejects unknown fields (strict mode)', () => {
    expect(() => PatchCycleSchema.parse({ start_date: '2026-05-01' })).toThrow();
  });

  it('rejects null apex_date when set explicitly', () => {
    // null apex_date is valid (clearing the apex)
    expect(() => PatchCycleSchema.parse({ apex_date: null })).not.toThrow();
  });
});
