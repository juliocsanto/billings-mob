/**
 * Unit tests — api/_lib/errorHandler.ts
 *
 * Covers:
 *   - redactLgpdFieldsFromObject (lines 38-73): nested objects, arrays, primitive passthrough,
 *     LGPD sensitive field redaction, email field redaction
 *   - apiLgpdBeforeSend (lines 61-74 / line 79): Sentry beforeSend hook — scrubs
 *     request.data, extra, contexts before events leave the server
 *   - Sentry init path (line 78-86): only initialised when SENTRY_DSN is set
 *   - captureException branch (line 128-130): called inside internalError when SENTRY_DSN present
 *   - All exported error helpers: notFound, unauthorized, forbidden, badRequest, conflict, internalError
 *
 * Strategy: vi.mock('@sentry/node') to intercept init() and captureException().
 * The beforeSend callback is captured from the init() call so we can invoke it
 * directly and assert that redactLgpdFieldsFromObject / apiLgpdBeforeSend work correctly.
 *
 * LGPD Art. 11: relations, notes, fcm_token, password, token, email* fields must
 * never appear in Sentry events — asserted here as a regression guard.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { Context } from 'hono';

// ─── Sentry mock ─────────────────────────────────────────────────────────────

const mockInit = vi.fn();
const mockCaptureException = vi.fn();

vi.mock('@sentry/node', () => ({
  init: mockInit,
  captureException: mockCaptureException,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeContext(): Context {
  return {
    json: vi.fn().mockImplementation((body: unknown, status?: number) => ({ body, status })),
    header: vi.fn(),
  } as unknown as Context;
}

type BeforeSendFn = (event: Record<string, unknown>) => Record<string, unknown> | null;

// ─── Module-level init behaviour ─────────────────────────────────────────────
//
// vi.resetModules() clears the module registry so the subsequent dynamic import()
// re-evaluates the module from scratch with the current process.env state.
// This replaces the query-string import pattern (?init-absent, ?init-with-dsn, etc.)
// which TypeScript (tsc) does not understand.

describe('errorHandler — Sentry init', () => {
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    mockInit.mockClear();
    mockCaptureException.mockClear();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('does NOT call Sentry.init when SENTRY_DSN is absent', async () => {
    delete process.env.SENTRY_DSN;
    vi.resetModules();
    await import('../_lib/errorHandler');
    expect(mockInit).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with the DSN when SENTRY_DSN is set', async () => {
    process.env.SENTRY_DSN = 'https://abc123@sentry.io/1';
    vi.resetModules();
    await import('../_lib/errorHandler');
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://abc123@sentry.io/1' }),
    );
  });

  it('Sentry.init receives a beforeSend callback', async () => {
    process.env.SENTRY_DSN = 'https://abc123@sentry.io/2';
    vi.resetModules();
    await import('../_lib/errorHandler');
    const initOpts = mockInit.mock.calls[mockInit.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(typeof initOpts.beforeSend).toBe('function');
  });
});

// ─── redactLgpdFieldsFromObject / apiLgpdBeforeSend ──────────────────────────
//
// We import the module ONCE with SENTRY_DSN set, capture the beforeSend callback,
// then exercise it across many test cases — no per-test re-import needed.

describe('errorHandler — redactLgpdFieldsFromObject via apiLgpdBeforeSend', () => {
  let beforeSend: BeforeSendFn;

  beforeAll(async () => {
    mockInit.mockClear();
    process.env.SENTRY_DSN = 'https://lgpd-test@sentry.io/99';
    // Fresh module import — vi.resetModules() ensures SENTRY_DSN is read at module load time
    vi.resetModules();
    await import('../_lib/errorHandler');
    expect(mockInit).toHaveBeenCalled();
    const initOpts = mockInit.mock.calls[mockInit.mock.calls.length - 1][0] as {
      beforeSend: BeforeSendFn;
    };
    beforeSend = initOpts.beforeSend;
  });

  afterAll(() => {
    delete process.env.SENTRY_DSN;
    mockInit.mockClear();
    vi.resetModules();
  });

  // ── Primitive / null pass-through ─────────────────────────────────────────

  it('passes through plain string in request.data unchanged', () => {
    const event = { request: { data: 'plain string' }, extra: {}, contexts: {} };
    const result = beforeSend(event as never);
    expect(result).not.toBeNull();
  });

  it('passes through null values unchanged inside objects', () => {
    const event = {
      request: { data: { safeField: null } },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as { request: { data: { safeField: null } } };
    expect(result.request.data.safeField).toBeNull();
  });

  it('passes through numeric values unchanged', () => {
    const event = {
      request: { data: { count: 42 } },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as { request: { data: { count: number } } };
    expect(result.request.data.count).toBe(42);
  });

  // ── Sensitive field redaction ──────────────────────────────────────────────

  it('redacts `relations` field to [REDACTED] in request.data', () => {
    const event = {
      request: { data: { relations: 'partner info', safeField: 'ok' } },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as {
      request: { data: { relations: string; safeField: string } };
    };
    expect(result.request.data.relations).toBe('[REDACTED]');
    expect(result.request.data.safeField).toBe('ok');
  });

  it('redacts `notes` field to [REDACTED] in request.data', () => {
    const event = {
      request: { data: { notes: 'private clinical note' } },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as { request: { data: { notes: string } } };
    expect(result.request.data.notes).toBe('[REDACTED]');
  });

  it('redacts `fcm_token` field to [REDACTED]', () => {
    const event = {
      request: { data: { fcm_token: 'device-token-abc' } },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as { request: { data: { fcm_token: string } } };
    expect(result.request.data.fcm_token).toBe('[REDACTED]');
  });

  it('redacts `password` field to [REDACTED]', () => {
    const event = {
      request: { data: { password: 's3cr3t' } },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as { request: { data: { password: string } } };
    expect(result.request.data.password).toBe('[REDACTED]');
  });

  it('redacts `token` field to [REDACTED]', () => {
    const event = {
      request: { data: { token: 'jwt-abc' } },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as { request: { data: { token: string } } };
    expect(result.request.data.token).toBe('[REDACTED]');
  });

  // ── LGPD regression: sensacao (health data — LGPD Art. 11) ───────────────

  it('redacts `sensacao` field to [REDACTED] in request.data', () => {
    const event = {
      request: { data: { sensacao: 'lubrificante', safeField: 'ok' } },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as {
      request: { data: { sensacao: string; safeField: string } };
    };
    expect(result.request.data.sensacao).toBe('[REDACTED]');
    expect(result.request.data.safeField).toBe('ok');
  });

  it('redacts nested `sensacao` field to [REDACTED]', () => {
    const event = {
      request: {
        data: { observation: { sensacao: 'seca', stamp: 'seco' } },
      },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as {
      request: { data: { observation: { sensacao: string; stamp: string } } };
    };
    expect(result.request.data.observation.sensacao).toBe('[REDACTED]');
    expect(result.request.data.observation.stamp).toBe('seco');
  });

  it('redacts `sensacao` in event.extra', () => {
    const event = {
      request: { data: {} },
      extra: { sensacao: 'molhada', safe: 'ok' },
      contexts: {},
    };
    const result = beforeSend(event as never) as {
      extra: { sensacao: string; safe: string };
    };
    expect(result.extra.sensacao).toBe('[REDACTED]');
    expect(result.extra.safe).toBe('ok');
  });

  it('redacts any key containing "email" (case-insensitive) to [REDACTED]', () => {
    const event = {
      request: { data: { email: 'user@example.com', userEmail: 'user@example.com' } },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as {
      request: { data: { email: string; userEmail: string } };
    };
    expect(result.request.data.email).toBe('[REDACTED]');
    expect(result.request.data.userEmail).toBe('[REDACTED]');
  });

  it('does NOT redact field named "error" (it does not contain "email")', () => {
    const event = {
      request: { data: { error: 'some error message' } },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as { request: { data: { error: string } } };
    // "error" does not contain "email" — must pass through unchanged
    expect(result.request.data.error).toBe('some error message');
  });

  // ── Nested object redaction ────────────────────────────────────────────────

  it('redacts sensitive fields in nested objects', () => {
    const event = {
      request: {
        data: {
          outer: {
            inner: {
              notes: 'deeply nested note',
              relations: 'deeply nested relations',
              safeKey: 'still here',
            },
          },
        },
      },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as {
      request: {
        data: { outer: { inner: { notes: string; relations: string; safeKey: string } } };
      };
    };
    expect(result.request.data.outer.inner.notes).toBe('[REDACTED]');
    expect(result.request.data.outer.inner.relations).toBe('[REDACTED]');
    expect(result.request.data.outer.inner.safeKey).toBe('still here');
  });

  // ── Array redaction ────────────────────────────────────────────────────────

  it('redacts sensitive fields inside objects that appear in arrays', () => {
    const event = {
      request: {
        data: [
          { relations: 'item0 relations', safe: 'a' },
          { notes: 'item1 notes', safe: 'b' },
        ],
      },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as {
      request: { data: Array<{ relations?: string; notes?: string; safe: string }> };
    };
    expect(result.request.data[0].relations).toBe('[REDACTED]');
    expect(result.request.data[0].safe).toBe('a');
    expect(result.request.data[1].notes).toBe('[REDACTED]');
    expect(result.request.data[1].safe).toBe('b');
  });

  it('passes through arrays of primitives unchanged', () => {
    const event = {
      request: { data: [1, 'two', true, null] },
      extra: {},
      contexts: {},
    };
    const result = beforeSend(event as never) as { request: { data: Array<unknown> } };
    expect(result.request.data).toEqual([1, 'two', true, null]);
  });

  // ── Scrubbing in event.extra ───────────────────────────────────────────────

  it('redacts sensitive fields in event.extra', () => {
    const event = {
      request: { data: {} },
      extra: { notes: 'extra note', fcm_token: 'tok', safe: 'ok' },
      contexts: {},
    };
    const result = beforeSend(event as never) as {
      extra: { notes: string; fcm_token: string; safe: string };
    };
    expect(result.extra.notes).toBe('[REDACTED]');
    expect(result.extra.fcm_token).toBe('[REDACTED]');
    expect(result.extra.safe).toBe('ok');
  });

  // ── Scrubbing in event.contexts ────────────────────────────────────────────

  it('redacts sensitive fields in event.contexts', () => {
    const event = {
      request: { data: {} },
      extra: {},
      contexts: { app: { relations: 'ctx relations', name: 'MyApp' } },
    };
    const result = beforeSend(event as never) as {
      contexts: { app: { relations: string; name: string } };
    };
    expect(result.contexts.app.relations).toBe('[REDACTED]');
    expect(result.contexts.app.name).toBe('MyApp');
  });

  // ── Missing event properties — no throw ───────────────────────────────────

  it('handles event with no request.data gracefully (does not throw)', () => {
    const event = { extra: {}, contexts: {} };
    const result = beforeSend(event as never);
    expect(result).not.toBeNull();
  });

  it('handles event with no extra gracefully (does not throw)', () => {
    const event = { request: { data: {} }, contexts: {} };
    const result = beforeSend(event as never);
    expect(result).not.toBeNull();
  });

  it('handles event with no contexts gracefully (does not throw)', () => {
    const event = { request: { data: {} }, extra: {} };
    const result = beforeSend(event as never);
    expect(result).not.toBeNull();
  });
});

// ─── Exported error helpers ────────────────────────────────────────────────
//
// The error helpers (notFound, unauthorized, etc.) are pure functions that do not
// depend on SENTRY_DSN at import time. We import the module once via a fresh
// vi.resetModules() call so we get a clean instance without stale Sentry state.

let errorHandlerMod: typeof import('../_lib/errorHandler');

beforeAll(async () => {
  vi.resetModules();
  errorHandlerMod = await import('../_lib/errorHandler');
});

describe('errorHandler — notFound', () => {
  it('returns 404 with error=NotFound', () => {
    const ctx = makeContext();
    errorHandlerMod.notFound(ctx);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'NotFound' }),
      404,
    );
  });

  it('uses custom message when provided', () => {
    const ctx = makeContext();
    errorHandlerMod.notFound(ctx, 'Cycle not found');
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Cycle not found' }),
      404,
    );
  });
});

describe('errorHandler — unauthorized', () => {
  it('returns 401 with error=Unauthorized', () => {
    const ctx = makeContext();
    errorHandlerMod.unauthorized(ctx);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' }),
      401,
    );
  });
});

describe('errorHandler — forbidden', () => {
  it('returns 403 with error=Forbidden', () => {
    const ctx = makeContext();
    errorHandlerMod.forbidden(ctx);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Forbidden' }),
      403,
    );
  });
});

describe('errorHandler — badRequest', () => {
  it('returns 400 with error=BadRequest', () => {
    const ctx = makeContext();
    errorHandlerMod.badRequest(ctx, 'Missing field');
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'BadRequest', message: 'Missing field' }),
      400,
    );
  });

  it('sanitizes LGPD-sensitive message containing "relations"', () => {
    const ctx = makeContext();
    errorHandlerMod.badRequest(ctx, 'Validation failed for relations field');
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal processing error' }),
      400,
    );
  });

  it('sanitizes LGPD-sensitive message containing "notes"', () => {
    const ctx = makeContext();
    errorHandlerMod.badRequest(ctx, 'Invalid value in notes');
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal processing error' }),
      400,
    );
  });

  // ── LGPD regression: sensacao in error messages ───────────────────────────
  it('sanitizes LGPD-sensitive message containing "sensacao"', () => {
    const ctx = makeContext();
    errorHandlerMod.badRequest(ctx, 'Validation failed for sensacao field');
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal processing error' }),
      400,
    );
  });
});

describe('errorHandler — conflict', () => {
  it('returns 409 with error=Conflict', () => {
    const ctx = makeContext();
    errorHandlerMod.conflict(ctx, 'Vector clock conflict detected');
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Conflict', message: 'Vector clock conflict detected' }),
      409,
    );
  });
});

describe('errorHandler — internalError', () => {
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    mockCaptureException.mockClear();
    mockInit.mockClear();
    vi.restoreAllMocks();
  });

  it('returns 500 with error=InternalServerError', () => {
    const ctx = makeContext();
    errorHandlerMod.internalError(ctx);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'InternalServerError' }),
      500,
    );
  });

  it('returns 500 when called without an error argument', () => {
    const ctx = makeContext();
    errorHandlerMod.internalError(ctx, undefined);
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'An unexpected error occurred' }),
      500,
    );
  });

  it('logs sanitized error message via console.error when err is an Error instance', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = makeContext();
    errorHandlerMod.internalError(ctx, new Error('something broke'));
    expect(consoleSpy).toHaveBeenCalledWith('[API Error]', 'something broke');
  });

  it('logs sanitized error message via console.error when err is a string', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = makeContext();
    errorHandlerMod.internalError(ctx, 'string error');
    expect(consoleSpy).toHaveBeenCalledWith('[API Error]', 'string error');
  });

  it('sanitizes LGPD-sensitive error before logging (relations in Error message)', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = makeContext();
    errorHandlerMod.internalError(ctx, new Error('lookup failed on relations column'));
    expect(consoleSpy).toHaveBeenCalledWith('[API Error]', 'Internal processing error');
  });

  it('calls Sentry.captureException when SENTRY_DSN is configured', () => {
    // captureException is checked at call time via process.env.SENTRY_DSN — no re-import needed
    process.env.SENTRY_DSN = 'https://abc@sentry.io/capture';
    mockCaptureException.mockClear();
    const ctx = makeContext();
    const err = new Error('unhandled error');
    errorHandlerMod.internalError(ctx, err);
    expect(mockCaptureException).toHaveBeenCalledWith(err);
  });

  it('does NOT call Sentry.captureException when SENTRY_DSN is absent', () => {
    delete process.env.SENTRY_DSN;
    mockCaptureException.mockClear();
    const ctx = makeContext();
    errorHandlerMod.internalError(ctx, new Error('some error'));
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('does not expose the raw error message to the client', () => {
    const ctx = makeContext();
    errorHandlerMod.internalError(ctx, new Error('database password=secret123 leaked'));
    const callArgs = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0];
    const responseBody = callArgs[0] as { message: string };
    expect(responseBody.message).toBe('An unexpected error occurred');
    expect(responseBody.message).not.toContain('password');
    expect(responseBody.message).not.toContain('secret');
  });
});
