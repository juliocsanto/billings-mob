/**
 * Unit tests — src/utils/lgpdScrubber.ts
 *
 * Regression guard: every LGPD Art. 11 sensitive field must be redacted before
 * a Sentry event leaves the browser. Tests mirror the api-side errorHandler tests
 * to ensure parity between the browser scrubber and the server scrubber.
 *
 * LGPD Art. 11 covered fields: relations, notes, sensacao, observacao_descricao,
 * fcm_token, password, token, email*.
 */

import { describe, it, expect } from 'vitest';
import { redactLgpdFields, LGPD_SENSITIVE_FIELDS } from '../lgpdScrubber';

// ─── LGPD_SENSITIVE_FIELDS list completeness ──────────────────────────────────

describe('LGPD_SENSITIVE_FIELDS', () => {
  it('includes "relations"', () => {
    expect(LGPD_SENSITIVE_FIELDS).toContain('relations');
  });

  it('includes "notes"', () => {
    expect(LGPD_SENSITIVE_FIELDS).toContain('notes');
  });

  it('includes "sensacao" (LGPD regression guard)', () => {
    expect(LGPD_SENSITIVE_FIELDS).toContain('sensacao');
  });

  it('includes "fcm_token"', () => {
    expect(LGPD_SENSITIVE_FIELDS).toContain('fcm_token');
  });
});

// ─── redactLgpdFields ─────────────────────────────────────────────────────────

describe('redactLgpdFields', () => {
  // ── Primitive pass-through ────────────────────────────────────────────────

  it('returns null unchanged', () => {
    expect(redactLgpdFields(null)).toBeNull();
  });

  it('returns primitives unchanged', () => {
    expect(redactLgpdFields(42)).toBe(42);
    expect(redactLgpdFields('hello')).toBe('hello');
    expect(redactLgpdFields(true)).toBe(true);
  });

  it('does not mutate the original object', () => {
    const original = { stamp: 'muco', sensacao: 'molhada', relations: true };
    redactLgpdFields(original);
    expect(original).toHaveProperty('sensacao', 'molhada');
    expect(original).toHaveProperty('relations', true);
  });

  // ── Core sensitive field redaction ────────────────────────────────────────

  it('redacts "relations" to [REDACTED]', () => {
    const result = redactLgpdFields({ relations: 'partner info', stamp: 'seco' }) as Record<string, unknown>;
    expect(result.relations).toBe('[REDACTED]');
    expect(result.stamp).toBe('seco');
  });

  it('redacts "notes" to [REDACTED]', () => {
    const result = redactLgpdFields({ notes: 'private note' }) as Record<string, unknown>;
    expect(result.notes).toBe('[REDACTED]');
  });

  // ── LGPD regression: sensacao (health data — LGPD Art. 11) ───────────────

  it('redacts "sensacao" to [REDACTED] (LGPD Art. 11 health data)', () => {
    const result = redactLgpdFields({ sensacao: 'lubrificante', stamp: 'muco' }) as Record<string, unknown>;
    expect(result.sensacao).toBe('[REDACTED]');
    expect(result.stamp).toBe('muco');
  });

  it('redacts "sensacao" value "seca" to [REDACTED]', () => {
    const result = redactLgpdFields({ sensacao: 'seca' }) as Record<string, unknown>;
    expect(result.sensacao).toBe('[REDACTED]');
  });

  it('redacts "sensacao" value "molhada" to [REDACTED]', () => {
    const result = redactLgpdFields({ sensacao: 'molhada' }) as Record<string, unknown>;
    expect(result.sensacao).toBe('[REDACTED]');
  });

  it('redacts all three of relations, notes, and sensacao together', () => {
    const result = redactLgpdFields({
      stamp: 'seco',
      relations: false,
      notes: 'nota',
      sensacao: 'seca',
      mucus: null,
    }) as Record<string, unknown>;
    expect(result.relations).toBe('[REDACTED]');
    expect(result.notes).toBe('[REDACTED]');
    expect(result.sensacao).toBe('[REDACTED]');
    expect(result.mucus).toBeNull();
    expect(result.stamp).toBe('seco');
  });

  // ── Nested redaction ──────────────────────────────────────────────────────

  it('redacts "sensacao" in nested objects', () => {
    const result = redactLgpdFields({
      outer: { inner: { sensacao: 'lubrificante', safe: 'ok' } },
    }) as { outer: { inner: { sensacao: string; safe: string } } };
    expect(result.outer.inner.sensacao).toBe('[REDACTED]');
    expect(result.outer.inner.safe).toBe('ok');
  });

  // ── Array redaction ───────────────────────────────────────────────────────

  it('redacts "sensacao" inside objects in arrays', () => {
    const result = redactLgpdFields([
      { sensacao: 'seca', stamp: 'seco' },
      { sensacao: 'molhada', stamp: 'muco' },
    ]) as Array<{ sensacao: string; stamp: string }>;
    expect(result[0].sensacao).toBe('[REDACTED]');
    expect(result[0].stamp).toBe('seco');
    expect(result[1].sensacao).toBe('[REDACTED]');
    expect(result[1].stamp).toBe('muco');
  });

  it('passes through arrays of primitives unchanged', () => {
    expect(redactLgpdFields([1, 'two', true])).toEqual([1, 'two', true]);
  });

  // ── Email field redaction ─────────────────────────────────────────────────

  it('redacts keys containing "email" (case-insensitive)', () => {
    const result = redactLgpdFields({ email: 'user@example.com', userEmail: 'x' }) as Record<string, unknown>;
    expect(result.email).toBe('[REDACTED]');
    expect(result.userEmail).toBe('[REDACTED]');
  });

  it('does NOT redact the key "error" (does not contain "email")', () => {
    const result = redactLgpdFields({ error: 'oops' }) as Record<string, unknown>;
    expect(result.error).toBe('oops');
  });
});
