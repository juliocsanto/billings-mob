/**
 * TDD — RED phase: Observation Zod schema validation tests
 * Sprint 1 — ADR-002 (Hono.js + Zod)
 *
 * Clinical constraint: stamp must never be 'fertil', 'infertil', 'seguro', 'inseguro'
 */
import { describe, it, expect } from 'vitest';
import { CreateObservationSchema, PatchObservationSchema } from '../schema';

describe('CreateObservationSchema', () => {
  const valid = {
    date: '2026-05-25',
    stamp: 'muco' as const,
    mucus: 'elastico' as const,
    bleeding: null,
    relations: false,
    notes: 'Observacao normal',
  };

  it('accepts a valid observation', () => {
    expect(() => CreateObservationSchema.parse(valid)).not.toThrow();
  });

  it('requires date in YYYY-MM-DD format', () => {
    expect(() => CreateObservationSchema.parse({ ...valid, date: '25/05/2026' })).toThrow();
    expect(() => CreateObservationSchema.parse({ ...valid, date: '2026-13-01' })).toThrow();
  });

  it('requires a valid stamp value', () => {
    const invalid = ['fertil', 'infertil', 'seguro', 'inseguro', '', 'outro'];
    invalid.forEach(s => {
      expect(() => CreateObservationSchema.parse({ ...valid, stamp: s })).toThrow();
    });
  });

  it('accepts all valid stamp values', () => {
    const stamps = ['sangramento', 'seco', 'muco', 'apice'];
    stamps.forEach(s => {
      expect(() => CreateObservationSchema.parse({ ...valid, stamp: s })).not.toThrow();
    });
  });

  it('accepts null mucus when stamp is seco', () => {
    expect(() => CreateObservationSchema.parse({ ...valid, stamp: 'seco', mucus: null })).not.toThrow();
  });

  it('rejects invalid mucus values', () => {
    expect(() => CreateObservationSchema.parse({ ...valid, mucus: 'liquido' })).toThrow();
  });

  it('rejects invalid bleeding values', () => {
    expect(() => CreateObservationSchema.parse({ ...valid, bleeding: 'forte' })).toThrow();
  });

  it('rejects notes longer than 500 chars', () => {
    const longNote = 'a'.repeat(501);
    expect(() => CreateObservationSchema.parse({ ...valid, notes: longNote })).toThrow();
  });

  it('accepts empty notes', () => {
    expect(() => CreateObservationSchema.parse({ ...valid, notes: '' })).not.toThrow();
  });

  it('accepts notes up to 500 chars', () => {
    const maxNote = 'a'.repeat(500);
    expect(() => CreateObservationSchema.parse({ ...valid, notes: maxNote })).not.toThrow();
  });

  it('requires relations as boolean', () => {
    expect(() => CreateObservationSchema.parse({ ...valid, relations: 'yes' })).toThrow();
  });
});

describe('PatchObservationSchema', () => {
  it('accepts partial updates', () => {
    expect(() => PatchObservationSchema.parse({ stamp: 'apice' })).not.toThrow();
    expect(() => PatchObservationSchema.parse({ mucus: 'cremoso' })).not.toThrow();
    expect(() => PatchObservationSchema.parse({ notes: 'nova nota' })).not.toThrow();
  });

  it('rejects empty patch (nothing to update)', () => {
    expect(() => PatchObservationSchema.parse({})).toThrow();
  });

  it('does not allow date change (date is immutable after creation)', () => {
    expect(() => PatchObservationSchema.parse({ date: '2026-05-24' })).toThrow();
  });

  it('does not allow vector_clock override from client', () => {
    expect(() => PatchObservationSchema.parse({ vector_clock: { 'A': 5 } })).toThrow();
  });
});
