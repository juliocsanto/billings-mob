/**
 * TDD — RED phase: LGPD audit data sanitization tests
 * Sprint 1 — LGPD Art. 11
 *
 * Rule: before_data and after_data in audit_log must NEVER contain
 * 'relations' or 'notes' fields.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeForAuditLog, assertNoSensitiveFields } from '../sanitizeAuditData';

describe('sanitizeForAuditLog', () => {
  it('removes relations field', () => {
    const result = sanitizeForAuditLog({
      id: 'abc',
      stamp: 'muco',
      relations: true,
    });
    expect(result).not.toHaveProperty('relations');
  });

  it('removes notes field', () => {
    const result = sanitizeForAuditLog({
      id: 'abc',
      stamp: 'muco',
      notes: 'texto sensivel',
    });
    expect(result).not.toHaveProperty('notes');
  });

  it('removes both relations and notes when both present', () => {
    const result = sanitizeForAuditLog({
      stamp: 'seco',
      relations: false,
      notes: 'outra nota',
      mucus: null,
    });
    expect(result).not.toHaveProperty('relations');
    expect(result).not.toHaveProperty('notes');
  });

  // ── LGPD regression: sensacao (LGPD Art. 11 health data) ─────────────────
  it('removes sensacao field (health data — LGPD Art. 11)', () => {
    const result = sanitizeForAuditLog({
      id: 'abc',
      stamp: 'muco',
      sensacao: 'lubrificante',
    });
    expect(result).not.toHaveProperty('sensacao');
  });

  it('removes sensacao together with relations and notes', () => {
    const result = sanitizeForAuditLog({
      stamp: 'seco',
      relations: false,
      notes: 'nota',
      sensacao: 'seca',
      mucus: null,
    });
    expect(result).not.toHaveProperty('relations');
    expect(result).not.toHaveProperty('notes');
    expect(result).not.toHaveProperty('sensacao');
  });

  it('preserves non-sensitive fields when sensacao is stripped', () => {
    const result = sanitizeForAuditLog({
      id: 'uuid-2',
      stamp: 'apice',
      sensacao: 'molhada',
      mucus: 'elastico',
    });
    expect(result).not.toHaveProperty('sensacao');
    expect(result).toHaveProperty('id', 'uuid-2');
    expect(result).toHaveProperty('stamp', 'apice');
    expect(result).toHaveProperty('mucus', 'elastico');
  });

  it('preserves all other fields', () => {
    const input = {
      id: 'uuid-1',
      stamp: 'apice',
      mucus: 'elastico',
      bleeding: null,
      version: 3,
    };
    const result = sanitizeForAuditLog(input);
    expect(result).toEqual(input);
  });

  it('handles null/undefined gracefully', () => {
    expect(sanitizeForAuditLog(null)).toBeNull();
    expect(sanitizeForAuditLog(undefined)).toBeUndefined();
  });

  it('does not mutate the original object', () => {
    const original = { stamp: 'seco', relations: true, notes: 'x' };
    sanitizeForAuditLog(original);
    expect(original).toHaveProperty('relations');
    expect(original).toHaveProperty('notes');
  });

  it('passes through non-object values unchanged', () => {
    expect(sanitizeForAuditLog(42 as unknown as Record<string, unknown>)).toBe(42);
    expect(sanitizeForAuditLog('string' as unknown as Record<string, unknown>)).toBe('string');
    expect(sanitizeForAuditLog(true as unknown as Record<string, unknown>)).toBe(true);
  });
});

describe('assertNoSensitiveFields', () => {
  it('throws when "relations" field is present', () => {
    expect(() => {
      assertNoSensitiveFields({ stamp: 'muco', relations: true });
    }).toThrow(/LGPD violation/i);
  });

  it('throws when "notes" field is present', () => {
    expect(() => {
      assertNoSensitiveFields({ stamp: 'seco', notes: 'texto sensível' });
    }).toThrow(/LGPD violation/i);
  });

  // ── LGPD regression: sensacao (LGPD Art. 11 health data) ─────────────────
  it('throws when "sensacao" field is present', () => {
    expect(() => {
      assertNoSensitiveFields({ stamp: 'muco', sensacao: 'lubrificante' });
    }).toThrow(/LGPD violation/i);
  });

  it('throws with message identifying the offending field', () => {
    expect(() => {
      assertNoSensitiveFields({ relations: false });
    }).toThrow(/relations/);
  });

  it('does NOT throw when no sensitive fields are present', () => {
    expect(() => {
      assertNoSensitiveFields({
        id: 'uuid-1',
        stamp: 'apice',
        mucus: 'elastico',
        bleeding: null,
        version: 3,
      });
    }).not.toThrow();
  });

  it('does NOT throw on an empty object', () => {
    expect(() => {
      assertNoSensitiveFields({});
    }).not.toThrow();
  });
});
