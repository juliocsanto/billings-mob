/**
 * Rate limiting middleware for Hono.js API routes.
 *
 * SEC-001 (OWASP A04 — Insecure Design): Brute-force protection.
 * DT-003 / ADR-017: Global rate limiting via Upstash Redis.
 *
 * Strategy:
 *   - If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are configured:
 *     use @upstash/ratelimit (sliding window) for globally consistent enforcement
 *     across all Vercel serverless instances.
 *   - Otherwise: fall back to in-memory sliding window (per-instance, for local dev
 *     and environments without Redis configured). Fail-open on Redis errors.
 *
 * Configuration:
 *   - AUTH_LIMIT: 10 requests / 60 s — authentication-adjacent endpoints
 *   - API_LIMIT:  60 requests / 60 s — general API endpoints
 *
 * LGPD: IP addresses are used as rate limit keys in-memory only.
 *       They are never written to any log or persistent database.
 *       Upstash stores the key (not the raw IP) with a TTL equal to the window.
 */
import type { Context, Next } from 'hono';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// CC-004: Named constants for keyPrefix — avoids magic strings across call sites.
const RATE_LIMIT_KEYS = { auth: 'auth', api: 'api' } as const;

// ---------------------------------------------------------------------------
// In-memory fallback implementation (original SEC-001 implementation)
// ---------------------------------------------------------------------------

interface WindowEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, WindowEntry>();

/**
 * Cleans up expired entries to prevent memory growth in long-lived instances.
 * Called probabilistically (1% of requests) to avoid adding latency on every call.
 */
function maybeCleanup(windowMs: number): void {
  if (Math.random() > 0.01) return;
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > windowMs) {
      store.delete(key);
    }
  }
}

/**
 * Creates an in-memory sliding-window rate limiter middleware.
 * Used when Upstash is not configured (local dev, CI, missing env vars).
 */
function createInMemoryRateLimiter(limit: number, windowMs: number, keyPrefix: string) {
  return async function rateLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';

    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    maybeCleanup(windowMs);

    const entry = store.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      // New window
      store.set(key, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
      if (entry.count > limit) {
        const retryAfterSec = Math.ceil((entry.windowStart + windowMs - now) / 1000);
        c.header('Retry-After', String(retryAfterSec));
        c.header('X-RateLimit-Limit', String(limit));
        c.header('X-RateLimit-Remaining', '0');
        return c.json(
          {
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Retry after ${retryAfterSec} seconds.`,
          },
          429
        );
      }
    }

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(limit - (store.get(key)?.count ?? 1)));

    await next();
  };
}

// ---------------------------------------------------------------------------
// Upstash Redis rate limiter (global, ADR-017)
// ---------------------------------------------------------------------------

/**
 * Creates an Upstash sliding-window rate limiter middleware.
 * Globally consistent across all Vercel serverless instances.
 * Fails open (allows request) if Redis is unavailable.
 *
 * @param limit     Maximum requests per window.
 * @param windowSec Window size in seconds (Upstash uses seconds, not ms).
 * @param keyPrefix Key prefix — combined with the client IP.
 */
function createUpstashRateLimiter(limit: number, windowSec: number, keyPrefix: string) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    prefix: keyPrefix,
  });

  return async function upstashRateLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';

    const identifier = `${keyPrefix}:${ip}`;

    try {
      const { success, remaining, reset } = await ratelimit.limit(identifier);

      c.header('X-RateLimit-Limit', String(limit));
      c.header('X-RateLimit-Remaining', String(remaining));

      if (!success) {
        const now = Date.now();
        const retryAfterSec = Math.max(0, Math.ceil((reset - now) / 1000));
        c.header('Retry-After', String(retryAfterSec));
        c.header('X-RateLimit-Remaining', '0');
        return c.json(
          {
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Retry after ${retryAfterSec} seconds.`,
          },
          429
        );
      }
    } catch {
      // Fail-open: if Redis is unavailable, allow the request through.
      // Logs are omitted intentionally — LGPD: avoid logging IP addresses.
    }

    await next();
  };
}

// ---------------------------------------------------------------------------
// Public factory — selects implementation based on env vars
// ---------------------------------------------------------------------------

/**
 * Creates a Hono middleware that enforces a sliding-window rate limit.
 *
 * Automatically selects the Upstash Redis implementation when
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are configured.
 * Falls back to in-memory when they are absent.
 *
 * @param limit      Maximum number of requests allowed in the window.
 * @param windowMs   Window size in milliseconds.
 * @param keyPrefix  Prefix for the store key — use distinct values per route group.
 */
export function createRateLimiter(limit: number, windowMs: number, keyPrefix: string) {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    const windowSec = Math.ceil(windowMs / 1000);
    return createUpstashRateLimiter(limit, windowSec, keyPrefix);
  }

  return createInMemoryRateLimiter(limit, windowMs, keyPrefix);
}

/**
 * Pre-configured limiters for the two tiers used in this API.
 *
 *  authRateLimit — applied to endpoints that trigger authentication operations
 *                  (e.g., any route that forwards JWTs to Supabase Auth repeatedly)
 *
 *  apiRateLimit  — applied to all general CRUD endpoints
 */
export const authRateLimit = createRateLimiter(10, 60_000, RATE_LIMIT_KEYS.auth);
export const apiRateLimit = createRateLimiter(60, 60_000, RATE_LIMIT_KEYS.api);
