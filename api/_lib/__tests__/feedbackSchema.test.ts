/**
 * Unit tests — Feedback schema Zod validation (ADR-018)
 *
 * TDD Red/Green/Refactor — written before implementation.
 *
 * Tests:
 *  - CreateFeedbackSchema: valid/invalid inputs
 *  - Clinical term rejection: restrição clínica inviolável
 *  - ListFeedbackQuerySchema: pagination defaults
 *  - CreateCommentSchema: length limits
 *
 * Restrição clínica: termos fértil/infértil/seguro/inseguro são rejeitados pelo schema.
 */

import { describe, it, expect } from 'vitest';
import {
  CreateFeedbackSchema,
  ListFeedbackQuerySchema,
  CreateCommentSchema,
  ApproveSchema,
  RejectSchema,
} from '../../feedback/schema';

// ─── CreateFeedbackSchema ─────────────────────────────────────────────────────

describe('CreateFeedbackSchema', () => {
  const validInput = {
    category: 'feature' as const,
    title: 'Melhorar a tela de início do app',
    content:
      'Seria ótimo ter uma tela de boas-vindas com tutorial de como usar o aplicativo pela primeira vez.',
  };

  it('accepts a valid feedback post', () => {
    const result = CreateFeedbackSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts all valid categories', () => {
    for (const category of ['bug', 'feature', 'improvement'] as const) {
      const result = CreateFeedbackSchema.safeParse({ ...validInput, category });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid category', () => {
    const result = CreateFeedbackSchema.safeParse({ ...validInput, category: 'other' });
    expect(result.success).toBe(false);
  });

  it('rejects title shorter than 5 characters', () => {
    const result = CreateFeedbackSchema.safeParse({ ...validInput, title: 'Oi' });
    expect(result.success).toBe(false);
  });

  it('rejects title longer than 200 characters', () => {
    const result = CreateFeedbackSchema.safeParse({
      ...validInput,
      title: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects content shorter than 10 characters', () => {
    const result = CreateFeedbackSchema.safeParse({ ...validInput, content: 'Curto' });
    expect(result.success).toBe(false);
  });

  it('rejects content longer than 2000 characters', () => {
    const result = CreateFeedbackSchema.safeParse({
      ...validInput,
      content: 'A'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (.strict())', () => {
    const result = CreateFeedbackSchema.safeParse({
      ...validInput,
      unknownField: 'value',
    });
    expect(result.success).toBe(false);
  });

  // ── Restrição clínica inviolável ──────────────────────────────────────────

  const clinicalTerms = [
    'fértil',
    'infértil',
    'fertil',
    'infertil',
    'seguro',
    'inseguro',
  ];

  it.each(clinicalTerms)(
    'rejects title containing clinical term "%s"',
    (term) => {
      const result = CreateFeedbackSchema.safeParse({
        ...validInput,
        title: `Quero ver quando o dia está ${term}`,
      });
      expect(result.success).toBe(false);
    },
  );

  it.each(clinicalTerms)(
    'rejects content containing clinical term "%s"',
    (term) => {
      const result = CreateFeedbackSchema.safeParse({
        ...validInput,
        content: `O app deveria mostrar quando o dia é ${term} ou não, para facilitar o uso.`,
      });
      expect(result.success).toBe(false);
    },
  );

  it('accepts content that uses correct MOB terminology (Ápice, PBI, muco)', () => {
    const result = CreateFeedbackSchema.safeParse({
      ...validInput,
      content:
        'Gostaria que o app destacasse melhor o registro de Ápice e mostrasse o PBI com cor diferente no gráfico.',
    });
    expect(result.success).toBe(true);
  });
});

// ─── ListFeedbackQuerySchema ──────────────────────────────────────────────────

describe('ListFeedbackQuerySchema', () => {
  it('applies defaults: page=1, limit=20', () => {
    const result = ListFeedbackQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('coerces string page/limit to numbers', () => {
    const result = ListFeedbackQuerySchema.safeParse({ page: '2', limit: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });

  it('rejects limit > 50', () => {
    const result = ListFeedbackQuerySchema.safeParse({ limit: 51 });
    expect(result.success).toBe(false);
  });

  it('rejects page < 1', () => {
    const result = ListFeedbackQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('accepts valid category filter', () => {
    const result = ListFeedbackQuerySchema.safeParse({ category: 'bug' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid category filter', () => {
    const result = ListFeedbackQuerySchema.safeParse({ category: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts valid status filter', () => {
    const result = ListFeedbackQuerySchema.safeParse({ status: 'pending_triage' });
    expect(result.success).toBe(true);
  });
});

// ─── CreateCommentSchema ──────────────────────────────────────────────────────

describe('CreateCommentSchema', () => {
  it('accepts a valid comment', () => {
    const result = CreateCommentSchema.safeParse({ content: 'Ótima sugestão!' });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = CreateCommentSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects content longer than 1000 characters', () => {
    const result = CreateCommentSchema.safeParse({ content: 'A'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (.strict())', () => {
    const result = CreateCommentSchema.safeParse({
      content: 'Valid comment',
      extra: 'field',
    });
    expect(result.success).toBe(false);
  });
});

// ─── ApproveSchema ────────────────────────────────────────────────────────────

describe('ApproveSchema', () => {
  it('accepts empty object (approvalNote is optional)', () => {
    const result = ApproveSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts optional approvalNote', () => {
    const result = ApproveSchema.safeParse({ approvalNote: 'Boa sugestão, priorizando.' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields (.strict())', () => {
    const result = ApproveSchema.safeParse({ approvalNote: 'ok', extra: 'field' });
    expect(result.success).toBe(false);
  });
});

// ─── RejectSchema ─────────────────────────────────────────────────────────────

describe('RejectSchema', () => {
  it('requires reason field', () => {
    const result = RejectSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty reason', () => {
    const result = RejectSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });

  it('accepts valid reason', () => {
    const result = RejectSchema.safeParse({
      reason: 'Feedback não se aplica ao escopo atual do app.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields (.strict())', () => {
    const result = RejectSchema.safeParse({ reason: 'ok', extra: 'field' });
    expect(result.success).toBe(false);
  });
});
