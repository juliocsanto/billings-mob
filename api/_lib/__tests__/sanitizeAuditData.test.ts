/**
 * TDD — RED phase: LGPD audit data sanitization tests
 * Sprint 1 — LGPD Art. 11
 *
 * Rule: before_data and after_data in audit_log must NEVER contain
 * 'relations' or 'notes' fields.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeForAuditLog } from '../sanitizeAuditData';

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
});
