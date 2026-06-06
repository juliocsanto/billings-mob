/**
 * Unit tests — api/_lib/rateLimit.ts — Upstash Redis path (lines 112-157)
 *
 * These tests cover the createUpstashRateLimiter inner function:
 *   - Success path: request allowed, headers set correctly
 *   - Rate-limit exceeded: returns 429 with Retry-After header
 *   - Fail-open: Redis unavailable (limit() throws) — request passes through
 *
 * Strategy: vi.mock('@upstash/ratelimit') and vi.mock('@upstash/redis') so the
 * Ratelimit and Redis constructors are intercepted.  The mock Ratelimit.limit()
 * returns controlled responses so we can exercise every branch.
 *
 * LGPD: IP addresses are never written to any log — asserted via absence of
 * console.log/error/info calls inside the middleware.
 *
 * DT-003 / ADR-017: Global rate limiting via Upstash Redis.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Context, Next } from 'hono';

// ─── Upstash mocks ────────────────────────────────────────────────────────────

// These are hoisted by Vitest before any imports.
const mockLimit = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    constructor(_opts: unknown) {}
  },
}));

vi.mock('@upstash/ratelimit', () => {
  class MockRatelimit {
    limit: ReturnType<typeof vi.fn>;
    constructor(_opts: unknown) {
      this.limit = mockLimit;
    }
    static slidingWindow = vi.fn().mockReturnValue('sliding-window-config');
  }
  return { Ratelimit: MockRatelimit };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeContext(ip = '1.2.3.4'): Context {
  return {
    req: {
      header: (name: string) => {
        if (name === 'x-forwarded-for') return ip;
        return undefined;
      },
    },
    header: vi.fn(),
    json: vi.fn().mockImplementation((body: unknown, status?: number) => ({ body, status })),
  } as unknown as Context;
}

function makeNext(): Next {
  return vi.fn().mockResolvedValue(undefined);
}

/**
 * Dynamically imports rateLimit.ts with Upstash env vars set.
 * Cache-busting ensures a fresh module per test (env vars are read at init time).
 */
async function getUpstashModule() {
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  return import('../_lib/rateLimit?upstash=' + Date.now());
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('rateLimit — Upstash Redis middleware (lines 124-157)', () => {
  beforeEach(() => {
    mockLimit.mockClear();
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.clearAllMocks();
  });

  // ── Success path: request allowed ─────────────────────────────────────────

  it('allows request when Upstash returns success=true, calls next()', async () => {
    const resetTime = Date.now() + 60_000;
    mockLimit.mockResolvedValue({ success: true, remaining: 59, reset: resetTime });

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    const ctx = makeContext('1.2.3.4');
    const next = makeNext();

    await limiter(ctx, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.json).not.toHaveBeenCalled();
  });

  it('sets X-RateLimit-Limit header on allowed Upstash request', async () => {
    mockLimit.mockResolvedValue({ success: true, remaining: 59, reset: Date.now() + 60_000 });

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    const ctx = makeContext('1.2.3.4');

    await limiter(ctx, makeNext());

    expect(ctx.header).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
  });

  it('sets X-RateLimit-Remaining header on allowed Upstash request', async () => {
    mockLimit.mockResolvedValue({ success: true, remaining: 42, reset: Date.now() + 60_000 });

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    const ctx = makeContext('1.2.3.4');

    await limiter(ctx, makeNext());

    expect(ctx.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '42');
  });

  // ── Rate-limit exceeded path ───────────────────────────────────────────────

  it('returns 429 when Upstash returns success=false', async () => {
    const resetTime = Date.now() + 30_000;
    mockLimit.mockResolvedValue({ success: false, remaining: 0, reset: resetTime });

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    const ctx = makeContext('9.8.7.6');
    const next = makeNext();

    await limiter(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Too Many Requests' }),
      429,
    );
  });

  it('sets Retry-After header when rate limit exceeded via Upstash', async () => {
    const resetTime = Date.now() + 30_000;
    mockLimit.mockResolvedValue({ success: false, remaining: 0, reset: resetTime });

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    const ctx = makeContext('9.8.7.6');

    await limiter(ctx, makeNext());

    expect(ctx.header).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('sets X-RateLimit-Remaining to 0 when rate limit exceeded via Upstash', async () => {
    mockLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 10_000,
    });

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    const ctx = makeContext('9.8.7.6');

    await limiter(ctx, makeNext());

    expect(ctx.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
  });

  it('includes Retry-After message in 429 body', async () => {
    mockLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 15_000,
    });

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    const ctx = makeContext('9.8.7.6');

    await limiter(ctx, makeNext());

    const callArgs = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = callArgs[0] as { message: string };
    expect(body.message).toMatch(/Retry after/i);
  });

  // ── Fail-open path: Redis unavailable ─────────────────────────────────────

  it('allows request (fail-open) when Upstash limit() throws', async () => {
    mockLimit.mockRejectedValue(new Error('Redis connection refused'));

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    const ctx = makeContext('5.5.5.5');
    const next = makeNext();

    await limiter(ctx, next);

    // Fail-open: next() must be called even when Redis is unavailable
    expect(next).toHaveBeenCalledOnce();
    expect(ctx.json).not.toHaveBeenCalled();
  });

  it('does NOT log IP addresses when Redis throws (LGPD — no console output)', async () => {
    mockLimit.mockRejectedValue(new Error('timeout'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    const ctx = makeContext('192.168.1.1');

    await limiter(ctx, makeNext());

    // LGPD: IP must never be written to logs even on failure
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('calls next() after fail-open even with a different error type', async () => {
    mockLimit.mockRejectedValue('string error');

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    const next = makeNext();

    await limiter(makeContext('3.3.3.3'), next);

    expect(next).toHaveBeenCalledOnce();
  });

  // ── Identifier construction ────────────────────────────────────────────────

  it('passes identifier including IP to ratelimit.limit()', async () => {
    mockLimit.mockResolvedValue({ success: true, remaining: 59, reset: Date.now() + 60_000 });

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'myprefix');
    const ctx = makeContext('10.20.30.40');

    await limiter(ctx, makeNext());

    expect(mockLimit).toHaveBeenCalledWith('myprefix:10.20.30.40');
  });

  it('uses x-real-ip when x-forwarded-for is absent', async () => {
    mockLimit.mockResolvedValue({ success: true, remaining: 59, reset: Date.now() + 60_000 });

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');

    const ctxWithRealIp = {
      req: {
        header: (name: string) => {
          if (name === 'x-real-ip') return '77.88.99.00';
          return undefined;
        },
      },
      header: vi.fn(),
      json: vi.fn(),
    } as unknown as Context;

    await limiter(ctxWithRealIp, makeNext());

    expect(mockLimit).toHaveBeenCalledWith('api:77.88.99.00');
  });

  it('falls back to "unknown" identifier when no IP headers are present', async () => {
    mockLimit.mockResolvedValue({ success: true, remaining: 59, reset: Date.now() + 60_000 });

    const mod = await getUpstashModule();
    const limiter = mod.createRateLimiter(60, 60_000, 'api');

    const ctxNoIp = {
      req: { header: () => undefined },
      header: vi.fn(),
      json: vi.fn(),
    } as unknown as Context;

    await limiter(ctxNoIp, makeNext());

    expect(mockLimit).toHaveBeenCalledWith('api:unknown');
  });
});
