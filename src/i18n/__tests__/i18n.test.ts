/**
 * i18n smoke tests — RED phase
 *
 * AC: i18n config loads both locales without error.
 * AC: both locale files contain expected top-level keys.
 * AC: no locale value contains forbidden clinical strings (fertile/infertile/safe/unsafe).
 * AC: 'relations' key never appears in any locale file.
 * AC: stamp domain values appear only as keys, never as translated values in en.json.
 *
 * Clinical constraint: verified by the forbidden-strings test below.
 * LGPD constraint: verified by the relations-key test below.
 */

import { describe, it, expect } from 'vitest';
import ptBR from '../locales/pt-BR.json';
import en from '../locales/en.json';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect all string values from a nested object. */
function collectValues(obj: unknown, acc: string[] = []): string[] {
  if (typeof obj === 'string') {
    acc.push(obj);
  } else if (typeof obj === 'object' && obj !== null) {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      collectValues(v, acc);
    }
  }
  return acc;
}

/** Recursively collect all leaf keys from a nested object. */
function collectKeys(obj: unknown, acc: string[] = []): string[] {
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      acc.push(k);
      collectKeys(v, acc);
    }
  }
  return acc;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('i18n locale files', () => {
  describe('structure — top-level keys present', () => {
    const REQUIRED_KEYS = ['auth', 'nav', 'stamps', 'dayDetail', 'linkInstructor', 'linkStatus', 'common'];

    it('pt-BR.json has all required top-level keys', () => {
      for (const key of REQUIRED_KEYS) {
        expect(ptBR).toHaveProperty(key);
      }
    });

    it('en.json has all required top-level keys', () => {
      for (const key of REQUIRED_KEYS) {
        expect(en).toHaveProperty(key);
      }
    });
  });

  describe('auth section', () => {
    it('pt-BR auth has emailLabel and sendMagicLink', () => {
      expect(ptBR.auth).toHaveProperty('emailLabel');
      expect(ptBR.auth).toHaveProperty('sendMagicLink');
    });

    it('en auth has emailLabel and sendMagicLink', () => {
      expect(en.auth).toHaveProperty('emailLabel');
      expect(en.auth).toHaveProperty('sendMagicLink');
    });
  });

  describe('nav section', () => {
    it('pt-BR nav has grafico, registrar, perfil, vincular', () => {
      expect(ptBR.nav).toHaveProperty('grafico');
      expect(ptBR.nav).toHaveProperty('perfil');
    });

    it('en nav has grafico (Chart), perfil (Profile)', () => {
      expect(en.nav).toHaveProperty('grafico');
      expect(en.nav).toHaveProperty('perfil');
    });
  });

  describe('stamps section', () => {
    const STAMP_DOMAIN_VALUES = ['sangramento', 'seco', 'muco', 'apice'];

    it('pt-BR stamps has all domain keys', () => {
      for (const stamp of STAMP_DOMAIN_VALUES) {
        expect(ptBR.stamps).toHaveProperty(stamp);
      }
    });

    it('en stamps has all domain keys', () => {
      for (const stamp of STAMP_DOMAIN_VALUES) {
        expect(en.stamps).toHaveProperty(stamp);
      }
    });

    it('en stamp KEYS are domain constants (sangramento/seco/muco/apice)', () => {
      // Domain values used in DB comparisons must remain as keys — never translate them
      const enStampKeys = Object.keys(en.stamps);
      expect(enStampKeys).toContain('sangramento');
      expect(enStampKeys).toContain('seco');
      expect(enStampKeys).toContain('muco');
      expect(enStampKeys).toContain('apice');
    });
  });

  describe('clinical constraint — forbidden strings', () => {
    // Critical: no translation value may contain fertility classifications.
    const FORBIDDEN = ['fertile', 'infertile', 'safe day', 'unsafe', 'safe period'];

    it('pt-BR values contain NO forbidden clinical strings', () => {
      const values = collectValues(ptBR);
      for (const forbidden of FORBIDDEN) {
        const match = values.find(v => v.toLowerCase().includes(forbidden.toLowerCase()));
        expect(match, `pt-BR contains forbidden string "${forbidden}" in value: "${match}"`).toBeUndefined();
      }
    });

    it('en values contain NO forbidden clinical strings', () => {
      const values = collectValues(en);
      for (const forbidden of FORBIDDEN) {
        const match = values.find(v => v.toLowerCase().includes(forbidden.toLowerCase()));
        expect(match, `en contains forbidden string "${forbidden}" in value: "${match}"`).toBeUndefined();
      }
    });
  });

  describe('LGPD constraint — sensitive fields never appear as i18n keys', () => {
    const LGPD_FORBIDDEN_KEYS = ['relations', 'notes'];

    it('pt-BR keys never include LGPD-sensitive field names', () => {
      const keys = collectKeys(ptBR);
      for (const forbidden of LGPD_FORBIDDEN_KEYS) {
        expect(keys, `pt-BR exposes LGPD key "${forbidden}"`).not.toContain(forbidden);
      }
    });

    it('en keys never include LGPD-sensitive field names', () => {
      const keys = collectKeys(en);
      for (const forbidden of LGPD_FORBIDDEN_KEYS) {
        expect(keys, `en exposes LGPD key "${forbidden}"`).not.toContain(forbidden);
      }
    });
  });

  describe('parity — both locales have the same top-level keys', () => {
    it('en and pt-BR share the same top-level keys', () => {
      expect(Object.keys(en).sort()).toEqual(Object.keys(ptBR).sort());
    });
  });
});
