/**
 * Unit tests — rateLimit middleware (createRateLimiter)
 *
 * Covers:
 *  - Normal request: passes through and sets X-RateLimit-Limit / X-RateLimit-Remaining headers
 *  - Rate limit exceeded: returns 429 with Retry-After and X-RateLimit-Remaining: 0
 *  - New window after expiry: resets counter and allows request
 *  - maybeCleanup: expired entries are removed when Math.random() <= 0.01
 *  - maybeCleanup: skipped when Math.random() > 0.01 (fast path)
 *  - Different IPs are tracked independently
 *  - X-Forwarded-For and X-Real-IP header extraction
 *  - Falls back to 'unknown' when neither IP header is present
 *
 * SEC-001 (OWASP A04 — Insecure Design): brute-force protection.
 * LGPD: IP is ephemeral in-memory only — never written to logs or DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Next } from 'hono';

// ── Minimal Hono Context mock ─────────────────────────────────────────────────

type HeadersStore = Record<string, string>;

function makeContext(ip?: string, realIp?: string): {
  c: {
    req: {
      header: (name: string) => string | undefined;
    };
    header: (name: string, value: string) => void;
    json: (body: unknown, status: number) => Response;
    _headers: HeadersStore;
  };
  next: Next;
} {
  const headers: HeadersStore = {};
  const c = {
    req: {
      header: (name: string) => {
        if (name === 'x-forwarded-for') return ip;
        if (name === 'x-real-ip') return realIp;
        return undefined;
      },
    },
    header: (name: string, value: string) => {
      headers[name] = value;
    },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
    _headers: headers,
  };
  const next = vi.fn().mockResolvedValue(undefined) as unknown as Next;
  return { c, next };
}

// Import after setting up the module — note: createRateLimiter uses a module-level Map,
// so we re-import fresh or manipulate timing via vi.setSystemTime
import { createRateLimiter } from '../rateLimit';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useRealTimers();
    // Use a unique keyPrefix per test group to avoid store contamination
  });

  // ── Normal pass-through ────────────────────────────────────────────────────

  it('calls next() and sets X-RateLimit headers for a normal request', async () => {
    const limiter = createRateLimiter(10, 60_000, `test-normal-${Date.now()}`);
    const { c, next } = makeContext('192.168.1.1');

    await limiter(c as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(c._headers['X-RateLimit-Limit']).toBe('10');
    expect(c._headers['X-RateLimit-Remaining']).toBe('9');
  });

  it('decrements X-RateLimit-Remaining on subsequent requests from same IP', async () => {
    const prefix = `test-decrement-${Date.now()}`;
    const limiter = createRateLimiter(5, 60_000, prefix);
    const { c, next } = makeContext('10.0.0.1');

    // First request
    await limiter(c as never, next);
    expect(c._headers['X-RateLimit-Remaining']).toBe('4');

    // Second request — fresh context from same IP
    const { c: c2, next: next2 } = makeContext('10.0.0.1');
    await limiter(c2 as never, next2);
    expect(c2._headers['X-RateLimit-Remaining']).toBe('3');
  });

  // ── 429 Too Many Requests ─────────────────────────────────────────────────

  it('returns 429 when limit is exceeded, with Retry-After and X-RateLimit-Remaining: 0', async () => {
    const prefix = `test-429-${Date.now()}`;
    const limit = 3;
    const limiter = createRateLimiter(limit, 60_000, prefix);

    // Exhaust the limit
    for (let i = 0; i < limit; i++) {
      const { c, next } = makeContext('172.16.0.1');
      await limiter(c as never, next);
    }

    // The (limit + 1)th request should be rejected
    const { c: cBlocked, next: nextBlocked } = makeContext('172.16.0.1');
    const result = await limiter(cBlocked as never, nextBlocked);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(429);
    expect(cBlocked._headers['X-RateLimit-Remaining']).toBe('0');
    expect(cBlocked._headers['Retry-After']).toBeDefined();
    // next() must NOT have been called
    expect(nextBlocked).not.toHaveBeenCalled();
  });

  it('response body contains "Too Many Requests" error message', async () => {
    const prefix = `test-429-body-${Date.now()}`;
    const limit = 1;
    const limiter = createRateLimiter(limit, 60_000, prefix);

    // Use the limit
    const { c: c1, next: n1 } = makeContext('172.16.0.2');
    await limiter(c1 as never, n1);

    // Exceed
    const { c: cBlocked, next: nBlocked } = makeContext('172.16.0.2');
    const response = await limiter(cBlocked as never, nBlocked);

    expect(response).toBeInstanceOf(Response);
    const body = JSON.parse(await (response as Response).text()) as Record<string, string>;
    expect(body.error).toBe('Too Many Requests');
    expect(body.message).toContain('Retry after');
  });

  // ── Window reset ──────────────────────────────────────────────────────────

  it('resets counter after window expires and allows new requests', async () => {
    vi.useFakeTimers();
    const prefix = `test-reset-${Date.now()}`;
    const windowMs = 1_000; // 1 second for test
    const limit = 2;
    const limiter = createRateLimiter(limit, windowMs, prefix);

    // Exhaust limit at t=0
    for (let i = 0; i < limit; i++) {
      const { c, next } = makeContext('10.10.10.1');
      await limiter(c as never, next);
    }

    // t=0: should be blocked
    const { c: cBlocked, next: nBlocked } = makeContext('10.10.10.1');
    const blocked = await limiter(cBlocked as never, nBlocked);
    expect((blocked as Response).status).toBe(429);

    // Advance time past window
    vi.advanceTimersByTime(windowMs + 100);

    // New request should succeed (new window)
    const { c: cNew, next: nNew } = makeContext('10.10.10.1');
    const result = await limiter(cNew as never, nNew);
    expect(result).toBeUndefined(); // next() was called, no Response returned
    expect(nNew).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  // ── Different IPs are independent ─────────────────────────────────────────

  it('tracks different IPs independently', async () => {
    const prefix = `test-ips-${Date.now()}`;
    const limit = 1;
    const limiter = createRateLimiter(limit, 60_000, prefix);

    // IP A exhausts its limit
    const { c: cA, next: nA } = makeContext('1.1.1.1');
    await limiter(cA as never, nA);
    const { c: cABlocked, next: nABlocked } = makeContext('1.1.1.1');
    const blockedA = await limiter(cABlocked as never, nABlocked);
    expect((blockedA as Response).status).toBe(429);

    // IP B should still pass
    const { c: cB, next: nB } = makeContext('2.2.2.2');
    const resultB = await limiter(cB as never, nB);
    expect(resultB).toBeUndefined();
    expect(nB).toHaveBeenCalledOnce();
  });

  // ── IP header extraction ──────────────────────────────────────────────────

  it('extracts IP from X-Forwarded-For (first value in comma list)', async () => {
    const prefix = `test-xff-${Date.now()}`;
    const limit = 1;
    const limiter = createRateLimiter(limit, 60_000, prefix);

    // X-Forwarded-For with multiple IPs: "1.2.3.4, 5.6.7.8"
    const { c, next } = makeContext('1.2.3.4, 5.6.7.8');
    await limiter(c as never, next);

    // Exceed from same first IP
    const { c: cBlocked, next: nBlocked } = makeContext('1.2.3.4, 5.6.7.8');
    const blocked = await limiter(cBlocked as never, nBlocked);
    expect((blocked as Response).status).toBe(429);

    // Different first IP should pass
    const { c: cOther, next: nOther } = makeContext('9.9.9.9, 5.6.7.8');
    const result = await limiter(cOther as never, nOther);
    expect(result).toBeUndefined();
  });

  it('falls back to X-Real-IP when X-Forwarded-For is absent', async () => {
    const prefix = `test-realip-${Date.now()}`;
    const limit = 1;
    const limiter = createRateLimiter(limit, 60_000, prefix);

    // No X-Forwarded-For, but X-Real-IP present
    const { c, next } = makeContext(undefined, '3.3.3.3');
    await limiter(c as never, next);

    const { c: cBlocked, next: nBlocked } = makeContext(undefined, '3.3.3.3');
    const blocked = await limiter(cBlocked as never, nBlocked);
    expect((blocked as Response).status).toBe(429);
  });

  it('uses "unknown" key when neither IP header is present', async () => {
    const prefix = `test-unknown-${Date.now()}`;
    const limit = 1;
    const limiter = createRateLimiter(limit, 60_000, prefix);

    const { c, next } = makeContext(undefined, undefined);
    await limiter(c as never, next);

    const { c: cBlocked, next: nBlocked } = makeContext(undefined, undefined);
    const blocked = await limiter(cBlocked as never, nBlocked);
    expect((blocked as Response).status).toBe(429);
  });

  // ── maybeCleanup ──────────────────────────────────────────────────────────

  it('maybeCleanup removes expired entries when Math.random() <= 0.01', async () => {
    vi.useFakeTimers();
    // Force cleanup to run by stubbing Math.random to return 0 (≤ 0.01)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    const prefix = `test-cleanup-${Date.now()}`;
    const windowMs = 500;
    const limit = 100;
    const limiter = createRateLimiter(limit, windowMs, prefix);

    // Make a request to insert an entry
    const { c, next } = makeContext('4.4.4.4');
    await limiter(c as never, next);

    // Advance time past window so entry is expired
    vi.advanceTimersByTime(windowMs + 100);

    // Make another request — this triggers maybeCleanup which should remove the old entry
    const { c: c2, next: next2 } = makeContext('5.5.5.5');
    await limiter(c2 as never, next2);

    // The subsequent request from the original IP should be a "new window" (counter reset)
    const { c: c3, next: next3 } = makeContext('4.4.4.4');
    await limiter(c3 as never, next3);
    expect(c3._headers['X-RateLimit-Remaining']).toBe(String(limit - 1));

    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it('maybeCleanup is skipped when Math.random() > 0.01', async () => {
    // Force Math.random to return a value > 0.01 so cleanup is bypassed
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const prefix = `test-no-cleanup-${Date.now()}`;
    const limiter = createRateLimiter(10, 60_000, prefix);
    const { c, next } = makeContext('6.6.6.6');

    // This should still function normally (just no cleanup runs)
    await limiter(c as never, next);
    expect(next).toHaveBeenCalledOnce();

    randomSpy.mockRestore();
  });
});
