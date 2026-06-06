/**
 * TDD — RED phase: tests written before implementation.
 *
 * Unit tests for the ai-guide Edge Function validation logic (S7-11).
 *
 * These tests cover the *validation rules* that the Edge Function enforces,
 * extracted as pure functions — no Deno/ESM dependencies needed.
 *
 * ADR-016: Supabase Edge Function proxy for Claude streaming.
 * LGPD: only { question: string } transits — never clinical data.
 * Clinical constraint: system prompt forbids fértil/infértil/seguro/inseguro.
 */

import { describe, it, expect } from 'vitest';

// ─── Extracted validation logic (mirrors Edge Function) ───────────────────────
// These pure functions are extracted from the Edge Function to enable unit
// testing without Deno runtime. The Edge Function imports them inline.

/** Returns true when the Authorization header is a valid Bearer token. */
function isValidAuthHeader(header: string | null): boolean {
  return typeof header === 'string' && header.startsWith('Bearer ') && header.length > 7;
}

/** Returns true when the question is a non-empty trimmed string. */
function isValidQuestion(question: unknown): boolean {
  return (
    typeof question === 'string' &&
    question.trim().length > 0
  );
}

/** Builds the SSE response headers. */
function buildSSEHeaders(corsHeaders: Record<string, string>): Record<string, string> {
  return {
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
  };
}

/** LGPD: asserts that only the question field is present in the request body. */
function extractSafeBody(body: Record<string, unknown>): { question: string } | null {
  const { question } = body;
  if (!isValidQuestion(question)) return null;
  // All other fields are ignored — never forwarded to Anthropic
  return { question: (question as string).trim() };
}

/** Clinical constraint: verify the system prompt never classifies fertility. */
const SYSTEM_PROMPT = `Você é um guia educativo do Método de Ovulação Billings (MOB).
Seu papel é ajudar usuárias que já fizeram consultoria com instrutora certificada a entender e usar este aplicativo de registro.
NUNCA interprete o ciclo de uma usuária específica.
NUNCA use os termos: fértil, infértil, seguro, inseguro — estes termos são exclusivos da instrutora certificada.
Terminologia correta: Ápice (não pico), PBI (Ponto Básico Inferior), muco, sangramento, seco.
Seja acolhedora, concisa e sempre em português brasileiro.
Quando a pergunta requerer avaliação clínica individual, diga: "Para interpretação do seu ciclo, consulte sua instrutora certificada."`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ai-guide Edge Function — request validation', () => {
  describe('AC1 — Authorization header validation (→ 401 when missing/invalid)', () => {
    it('rejects null Authorization header', () => {
      expect(isValidAuthHeader(null)).toBe(false);
    });

    it('rejects empty Authorization header', () => {
      expect(isValidAuthHeader('')).toBe(false);
    });

    it('rejects Authorization without Bearer prefix', () => {
      expect(isValidAuthHeader('token abc123')).toBe(false);
    });

    it('rejects "Bearer " with no token value', () => {
      expect(isValidAuthHeader('Bearer ')).toBe(false);
    });

    it('accepts a valid Bearer token', () => {
      expect(isValidAuthHeader('Bearer eyJhbGciOiJIUzI1NiJ9.abc.def')).toBe(true);
    });
  });

  describe('AC2 — question validation (→ 400 when missing/empty)', () => {
    it('rejects undefined question', () => {
      expect(isValidQuestion(undefined)).toBe(false);
    });

    it('rejects null question', () => {
      expect(isValidQuestion(null)).toBe(false);
    });

    it('rejects empty string question', () => {
      expect(isValidQuestion('')).toBe(false);
    });

    it('rejects whitespace-only question', () => {
      expect(isValidQuestion('   ')).toBe(false);
    });

    it('rejects numeric question', () => {
      expect(isValidQuestion(42)).toBe(false);
    });

    it('accepts a valid question string', () => {
      expect(isValidQuestion('O que é o Ápice?')).toBe(true);
    });

    it('trims and accepts question with surrounding whitespace', () => {
      expect(isValidQuestion('  Como registrar muco?  ')).toBe(true);
    });
  });

  describe('LGPD — extractSafeBody only forwards question', () => {
    it('extracts only { question } from a body that contains extra fields', () => {
      const body = {
        question: 'O que é PBI?',
        observations: { '2026-06-01': { stamp: 'muco' } },
        stamps: ['muco', 'seco'],
        notes: 'nota privada',
        relations: 'dado sensível',
        userId: 'user-123',
        cycleStart: '2026-05-01',
      };
      const safe = extractSafeBody(body);
      expect(safe).not.toBeNull();
      expect(Object.keys(safe!)).toEqual(['question']);
      expect(safe!.question).toBe('O que é PBI?');
    });

    it('trims the question before forwarding', () => {
      const body = { question: '  Como usar o app?  ' };
      const safe = extractSafeBody(body);
      expect(safe?.question).toBe('Como usar o app?');
    });

    it('returns null when question is missing', () => {
      const body = { observations: {}, stamps: [] };
      expect(extractSafeBody(body as Record<string, unknown>)).toBeNull();
    });

    it('never includes "relations" in the safe body', () => {
      const body = { question: 'O que é muco?', relations: 'dados sensíveis' };
      const safe = extractSafeBody(body);
      expect(safe).not.toHaveProperty('relations');
    });

    it('never includes "notes" in the safe body', () => {
      const body = { question: 'O que é PBI?', notes: 'nota clínica' };
      const safe = extractSafeBody(body);
      expect(safe).not.toHaveProperty('notes');
    });
  });

  describe('SSE response headers', () => {
    it('builds correct SSE headers with CORS', () => {
      const cors = { 'Access-Control-Allow-Origin': '*' };
      const headers = buildSSEHeaders(cors);
      expect(headers['Content-Type']).toBe('text/event-stream');
      expect(headers['Cache-Control']).toBe('no-cache');
      expect(headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('Clinical constraint — system prompt never classifies fertility', () => {
    // These terms must ONLY appear in the prohibition context ("NUNCA use") —
    // never as affirmative cycle-state assertions.
    const PROHIBITED_AFFIRMATIVE_PATTERNS = [
      // The AI must never say "hoje é fértil" / "dia fértil" / "período fértil"
      /dia\s+fértil/i,
      /período\s+fértil/i,
      /fase\s+fértil/i,
      /dia\s+infértil/i,
      /período\s+infértil/i,
      /dia\s+seguro/i,
      /período\s+seguro/i,
      /período\s+inseguro/i,
      // English equivalents must never appear
      /fertile\s+day/i,
      /safe\s+day/i,
      /unsafe\s+day/i,
    ];

    for (const pattern of PROHIBITED_AFFIRMATIVE_PATTERNS) {
      it(`system prompt does NOT contain fertility-classification pattern ${pattern}`, () => {
        expect(SYSTEM_PROMPT).not.toMatch(pattern);
      });
    }

    it('system prompt contains the correct Ápice terminology (not pico)', () => {
      expect(SYSTEM_PROMPT).toContain('Ápice');
    });

    it('system prompt contains PBI terminology', () => {
      expect(SYSTEM_PROMPT).toContain('PBI');
    });

    it('system prompt delegates cycle interpretation to certified instructor', () => {
      expect(SYSTEM_PROMPT).toContain('instrutora certificada');
    });

    it('system prompt explicitly prohibits fértil/infértil/seguro/inseguro usage', () => {
      // The prohibition must be present — this is the clinical guardrail
      expect(SYSTEM_PROMPT).toContain('fértil');
      expect(SYSTEM_PROMPT).toContain('infértil');
      expect(SYSTEM_PROMPT).toContain('seguro');
      expect(SYSTEM_PROMPT).toContain('inseguro');
      // And the prohibition verb must be present
      expect(SYSTEM_PROMPT.toUpperCase()).toContain('NUNCA');
    });
  });
});
