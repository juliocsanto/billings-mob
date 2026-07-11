/**
 * LGPD Art. 11 — Sentry scrubber for the PWA (browser layer).
 *
 * Clinical and personal fields that must NEVER leave the device in Sentry
 * error reports. Extracted from src/main.jsx so the scrubbing logic can be
 * regression-tested independently.
 *
 * NC-02 auditoria ISO 27001:2022 — critério de aceitação obrigatório.
 */

export const LGPD_SENSITIVE_FIELDS: ReadonlyArray<string> = [
  'relations',             // orientação clínica da instrutora — LGPD Art. 11
  'notes',                 // notas livres da aluna — LGPD Art. 11
  'sensacao',              // sensação corporal (seca/molhada/lubrificante) — LGPD Art. 11
  'observacao_descricao',  // descrição do sangramento — LGPD Art. 11
  'fcm_token',             // token pessoal de push
  'password',
  'token',
];

/**
 * Recursively redacts LGPD-sensitive fields from any plain object or array.
 * Returns a new object — never mutates the original.
 */
export function redactLgpdFields(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(redactLgpdFields);
  }
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const isEmail =
        typeof key === 'string' && key.toLowerCase().includes('email') && key !== 'error';
      if (LGPD_SENSITIVE_FIELDS.includes(key) || isEmail) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactLgpdFields(val);
      }
    }
    return out;
  }
  return obj;
}
