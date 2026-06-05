/**
 * Rate limiting middleware for Hono.js API routes.
 *
 * SEC-001 (OWASP A04 — Insecure Design): Brute-force protection.
 *
 * Implementation: In-memory sliding window counter keyed by client IP.
 *
 * IMPORTANT — Vercel Serverless limitation:
 *   Each cold-started instance has its own in-memory store. This means the
 *   rate limit is per-instance, not globally enforced across all replicas.
 *   For production hardening (Sprint 5+), replace with Upstash Redis:
 *     https://upstash.com/docs/redis/sdks/ts/ratelimit
 *   Until then, this layer stops trivial brute-force from a single IP
 *   hitting the same warm instance repeatedly.
 *
 * Configuration:
 *   - AUTH_LIMIT: 10 requests / 60 s — authentication-adjacent endpoints
 *   - API_LIMIT:  60 requests / 60 s — general API endpoints
 *
 * LGPD: The IP address stored in-memory is never written to any log or DB.
 *       The store is ephemeral and lost on cold start.
 */
import type { Context, Next } from 'hono';

// CC-004: Named constants for keyPrefix — avoids magic strings across call sites.
const RATE_LIMIT_KEYS = { auth: 'auth', api: 'api' } as const;

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
 * Creates a Hono middleware that enforces a sliding-window rate limit.
 *
 * @param limit   Maximum number of requests allowed in the window.
 * @param windowMs  Window size in milliseconds.
 * @param keyPrefix  Prefix for the store key — use distinct values per route group.
 */
export function createRateLimiter(limit: number, windowMs: number, keyPrefix: string) {
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
