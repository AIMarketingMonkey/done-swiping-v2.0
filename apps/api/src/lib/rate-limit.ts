/**
 * src/lib/rate-limit.ts — lightweight in-memory fixed-window rate limiter.
 *
 * Each limiter is keyed on (clientIp + routeKey) to isolate abuse per endpoint.
 * Client IP is read from the `X-Forwarded-For` header (first value) falling back
 * to a string constant so the limiter degrades gracefully if the header is absent.
 *
 * TODO(scale): This limiter is per-process only.  In a multi-instance deployment
 * every instance maintains its own window, so the effective limit is
 * `max * instanceCount`.  Replace the `_counters` Map with a shared store
 * (Redis / Upstash) before scaling horizontally.  The factory signature is
 * intentionally identical to what a shared-store implementation would expose.
 *
 * Usage:
 *   import { rateLimit } from './rate-limit.js';
 *   app.post('/session/start', rateLimit({ windowMs: 60_000, max: 30 }), handler);
 */

import type { Context, MiddlewareHandler, Next } from 'hono';

interface RateLimitOptions {
  /** Duration of the fixed window in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed per window per (ip, routeKey) pair. */
  max: number;
}

interface WindowEntry {
  count: number;
  /** UNIX timestamp (ms) when this window expires and should reset. */
  expiresAt: number;
}

// Module-level map: (ip|routeKey) → window entry.
// Cleared on process restart; entries are lazily garbage-collected at lookup time.
const _counters = new Map<string, WindowEntry>();

/**
 * Extract the best available client IP from a Hono context.
 *
 * Reads `X-Forwarded-For` (set by Fly.io / Render / any reverse proxy) and
 * takes the first (leftmost) address.  Falls back to a constant so the limiter
 * still works — just treating all requests as one client — when the header is absent.
 */
function getClientIp(c: Context): string {
  const xForwardedFor = c.req.header('x-forwarded-for');
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  return '__unknown_ip__';
}

/**
 * Factory that returns a Hono middleware enforcing a fixed-window rate limit.
 *
 * @param options.windowMs - Window duration in ms (e.g. 60_000 for 1 minute).
 * @param options.max      - Requests allowed per window per client IP × route.
 *
 * Responds with HTTP 429 and a `Retry-After` header (seconds) when the limit
 * is exceeded.
 */
export function rateLimit({ windowMs, max }: RateLimitOptions): MiddlewareHandler {
  return async function rateLimitMiddleware(c: Context, next: Next): Promise<Response | void> {
    const ip = getClientIp(c);
    // Use the matched route path (pattern, not the actual URL) as the key so
    // /session/start limits are separate from /consent limits, etc.
    const routeKey = c.req.routePath ?? c.req.path;
    const key = `${ip}|${routeKey}`;
    const now = Date.now();

    let entry = _counters.get(key);

    if (!entry || now >= entry.expiresAt) {
      // Start a fresh window.
      entry = { count: 1, expiresAt: now + windowMs };
      _counters.set(key, entry);
    } else {
      entry.count += 1;
    }

    if (entry.count > max) {
      const retryAfterSecs = Math.ceil((entry.expiresAt - now) / 1000);
      c.header('Retry-After', String(retryAfterSecs));
      return c.json(
        {
          error: 'Too many requests — please slow down.',
          retryAfterSeconds: retryAfterSecs,
        },
        429,
      );
    }

    await next();
  };
}
