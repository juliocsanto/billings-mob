/**
 * TDD — Unit tests: Conflict resolution input validation
 * Sprint 1 — ADR-004 (Vector Clock + conflict resolution)
 *
 * Tests the ResolveConflictSchema validation rules.
 * Integration tests (actual DB calls) are in test:integration suite.
 *
 * Clinical constraint (§ 3.3 ARCHITECTURE.md — inviolable):
 *   Resolution never classifies a day as fertile or infertile.
 *   It only records which version the instructor chose.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Local re-definition of the schema for unit testing without importing the full Hono app
const ResolveConflictSchema = z.object({
  keep: z.enum(['instructor', 'student']),
  student_version_id: z.string().uuid().optional(),
}).refine(
  (data) => data.keep === 'instructor' || data.student_version_id !== undefined,
  {
    message: 'student_version_id is required when keep === "student"',
    path: ['student_version_id'],
  }
);

describe('ResolveConflictSchema', () => {
  it('accepts keep=instructor without student_version_id', () => {
    expect(() => ResolveConflictSchema.parse({ keep: 'instructor' })).not.toThrow();
  });

  it('accepts keep=student with valid student_version_id', () => {
    expect(() =>
      ResolveConflictSchema.parse({
        keep: 'student',
        student_version_id: '123e4567-e89b-12d3-a456-426614174000',
      })
    ).not.toThrow();
  });

  it('rejects keep=student without student_version_id', () => {
    expect(() => ResolveConflictSchema.parse({ keep: 'student' })).toThrow();
  });

  it('rejects invalid keep value', () => {
    expect(() =>
      ResolveConflictSchema.parse({
        keep: 'fertil',
        student_version_id: '123e4567-e89b-12d3-a456-426614174000',
      })
    ).toThrow();
  });

  it('rejects invalid student_version_id (not UUID)', () => {
    expect(() =>
      ResolveConflictSchema.parse({
        keep: 'student',
        student_version_id: 'not-a-uuid',
      })
    ).toThrow();
  });

  it('rejects empty object', () => {
    expect(() => ResolveConflictSchema.parse({})).toThrow();
  });

  it('enforces that keep is required', () => {
    expect(() =>
      ResolveConflictSchema.parse({
        student_version_id: '123e4567-e89b-12d3-a456-426614174000',
      })
    ).toThrow();
  });
});
