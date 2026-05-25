/**
 * Unit tests — errorHandler.ts
 *
 * Tests all error helper functions and the LGPD sanitization logic.
 * Ensures that error messages containing 'relations' or 'notes' are
 * replaced with a safe generic message.
 *
 * LGPD: errorHandler must never expose relations or notes field names in responses.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  notFound,
  unauthorized,
  forbidden,
  badRequest,
  conflict,
  internalError,
} from '../errorHandler';

// ─── Helper ───────────────────────────────────────────────────────────────────

async function callHandler(
  handler: (c: Context) => Response
): Promise<{ status: number; body: { error: string; message: string } }> {
  const app = new Hono();
  app.get('/test', (c) => handler(c));
  const res = await app.request('/test');
  return { status: res.status, body: await res.json() as { error: string; message: string } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('errorHandler', () => {
  it('notFound returns 404 with error: NotFound', async () => {
    const { status, body } = await callHandler((c) => notFound(c, 'Observation not found'));
    expect(status).toBe(404);
    expect(body.error).toBe('NotFound');
    expect(body.message).toBe('Observation not found');
  });

  it('notFound uses default message when none provided', async () => {
    const { status, body } = await callHandler((c) => notFound(c));
    expect(status).toBe(404);
    expect(body.message).toBe('Resource not found');
  });

  it('unauthorized returns 401 with error: Unauthorized', async () => {
    const { status, body } = await callHandler((c) => unauthorized(c));
    expect(status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('unauthorized uses custom message', async () => {
    const { status, body } = await callHandler((c) => unauthorized(c, 'Token expired'));
    expect(status).toBe(401);
    expect(body.message).toBe('Token expired');
  });

  it('forbidden returns 403 with error: Forbidden', async () => {
    const { status, body } = await callHandler((c) => forbidden(c, 'Only instructors'));
    expect(status).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(body.message).toBe('Only instructors');
  });

  it('badRequest returns 400 with error: BadRequest', async () => {
    const { status, body } = await callHandler((c) => badRequest(c, 'Invalid date format'));
    expect(status).toBe(400);
    expect(body.error).toBe('BadRequest');
    expect(body.message).toBe('Invalid date format');
  });

  it('LGPD: badRequest sanitizes message containing "relations"', async () => {
    const { status, body } = await callHandler((c) =>
      badRequest(c, 'Field relations is invalid')
    );
    expect(status).toBe(400);
    expect(body.message).toBe('Internal processing error');
    expect(body.message).not.toContain('relations');
  });

  it('LGPD: badRequest sanitizes message containing "notes"', async () => {
    const { body } = await callHandler((c) =>
      badRequest(c, 'notes field is too long')
    );
    expect(body.message).toBe('Internal processing error');
    expect(body.message).not.toContain('notes');
  });

  it('LGPD: badRequest is case-insensitive for sensitive pattern', async () => {
    const { body } = await callHandler((c) =>
      badRequest(c, 'RELATIONS field error')
    );
    expect(body.message).toBe('Internal processing error');
  });

  it('conflict returns 409 with error: Conflict', async () => {
    const { status, body } = await callHandler((c) => conflict(c, 'Duplicate entry'));
    expect(status).toBe(409);
    expect(body.error).toBe('Conflict');
    expect(body.message).toBe('Duplicate entry');
  });

  it('LGPD: conflict sanitizes message containing "relations"', async () => {
    const { body } = await callHandler((c) =>
      conflict(c, 'Duplicate relations entry')
    );
    expect(body.message).toBe('Internal processing error');
  });

  it('internalError returns 500 with generic message', async () => {
    const { status, body } = await callHandler((c) => internalError(c, new Error('DB timeout')));
    expect(status).toBe(500);
    expect(body.error).toBe('InternalServerError');
    expect(body.message).toBe('An unexpected error occurred');
  });

  it('internalError handles undefined error gracefully', async () => {
    const { status, body } = await callHandler((c) => internalError(c));
    expect(status).toBe(500);
    expect(body.error).toBe('InternalServerError');
  });

  it('internalError handles string error', async () => {
    const { status, body } = await callHandler((c) => internalError(c, 'raw string error'));
    expect(status).toBe(500);
    expect(body.error).toBe('InternalServerError');
    expect(body.message).toBe('An unexpected error occurred');
  });

  it('LGPD: internalError never exposes relations or notes in client response', async () => {
    const { body } = await callHandler((c) =>
      internalError(c, new Error('relations field constraint violation'))
    );
    expect(JSON.stringify(body)).not.toContain('relations');
  });
});
