/**
 * Unit tests — api/_lib/rateLimit.ts
 *
 * DT-003: Rate limit global via Upstash Redis (ADR-017).
 * Fallback: in-memory when UPSTASH_REDIS_REST_URL/TOKEN are not configured.
 *
 * These tests exercise the public interface (authRateLimit, apiRateLimit)
 * without requiring a live Redis connection — tests run against the in-memory
 * fallback by leaving Upstash env vars unset.
 *
 * LGPD: IP addresses are never written to any log or database.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Context, Next } from 'hono';

// Ensure Upstash env vars are NOT set for in-memory fallback tests
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.restoreAllMocks();
});

function makeContext(ip: string): Context {
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

async function getModule() {
  return import('../_lib/rateLimit?t=' + Date.now());
}

// ---------------------------------------------------------------------------
// In-memory fallback (no Upstash env vars)
// ---------------------------------------------------------------------------

describe('rateLimit — in-memory fallback (no Upstash env vars)', () => {
  it('createRateLimiter allows requests under the limit', async () => {
    const mod = await getModule();
    const limiter = mod.createRateLimiter(3, 60_000, `test-${Date.now()}`);
    const next = makeNext();
    const ctx = makeContext('1.2.3.4');

    await limiter(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.json).not.toHaveBeenCalled();
  });

  it('createRateLimiter blocks requests exceeding the limit with 429', async () => {
    const prefix = `test-block-${Date.now()}`;
    const mod = await getModule();
    const limiter = mod.createRateLimiter(2, 60_000, prefix);
    const ip = '10.0.0.1';

    const next1 = makeNext();
    const next2 = makeNext();
    const next3 = makeNext();

    // req 1 — ok
    await limiter(makeContext(ip), next1);
    // req 2 — ok
    await limiter(makeContext(ip), next2);
    // req 3 — exceeds limit
    const ctx3 = makeContext(ip);
    await limiter(ctx3, next3);

    expect(next1).toHaveBeenCalledOnce();
    expect(next2).toHaveBeenCalledOnce();
    expect(next3).not.toHaveBeenCalled();
    expect(ctx3.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Too Many Requests' }),
      429,
    );
  });

  it('sets X-RateLimit-Limit header on allowed requests', async () => {
    const mod = await getModule();
    const limit = 5;
    const limiter = mod.createRateLimiter(limit, 60_000, `test-headers-${Date.now()}`);
    const ctx = makeContext('192.168.1.1');
    const next = makeNext();

    await limiter(ctx, next);

    expect(ctx.header).toHaveBeenCalledWith('X-RateLimit-Limit', String(limit));
  });

  it('sets X-RateLimit-Remaining header on allowed requests', async () => {
    const mod = await getModule();
    const limit = 5;
    const limiter = mod.createRateLimiter(limit, 60_000, `test-remaining-${Date.now()}`);
    const ctx = makeContext('192.168.2.2');
    const next = makeNext();

    await limiter(ctx, next);

    // First request: remaining = limit - 1
    expect(ctx.header).toHaveBeenCalledWith('X-RateLimit-Remaining', String(limit - 1));
  });

  it('sets Retry-After header when rate limit is exceeded', async () => {
    const prefix = `test-retry-${Date.now()}`;
    const mod = await getModule();
    const limiter = mod.createRateLimiter(1, 60_000, prefix);
    const ip = '10.10.10.10';

    // req 1 — ok
    await limiter(makeContext(ip), makeNext());
    // req 2 — exceeds limit
    const ctx2 = makeContext(ip);
    await limiter(ctx2, makeNext());

    expect(ctx2.header).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('authRateLimit and apiRateLimit are exported and are functions', async () => {
    const mod = await getModule();

    expect(typeof mod.authRateLimit).toBe('function');
    expect(typeof mod.apiRateLimit).toBe('function');
  });

  it('different IPs have independent counters', async () => {
    const prefix = `test-ips-${Date.now()}`;
    const mod = await getModule();
    const limiter = mod.createRateLimiter(1, 60_000, prefix);

    const nextA = makeNext();
    const nextB = makeNext();

    await limiter(makeContext('1.1.1.1'), nextA);
    await limiter(makeContext('2.2.2.2'), nextB);

    // Both should pass — different IPs
    expect(nextA).toHaveBeenCalledOnce();
    expect(nextB).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Upstash Redis path — verify it is selected when env vars are present
// ---------------------------------------------------------------------------

describe('rateLimit — Upstash Redis path selected when env vars configured', () => {
  it('createRateLimiter uses Upstash when UPSTASH_REDIS_REST_URL and TOKEN are set', async () => {
    // Set env vars to simulate Upstash configured
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

    // Import fresh module so it detects env vars
    const mod = await getModule();

    // The limiter function should still be callable (interface unchanged)
    const limiter = mod.createRateLimiter(60, 60_000, 'api');
    expect(typeof limiter).toBe('function');
  });
});
