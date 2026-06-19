import type { Context, MiddlewareHandler } from 'hono';
import { getSupabaseAdmin } from './supabase-admin.js';

// Extend Hono's variable map so c.get('userId') is typed as string.
declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
  }
}

/**
 * Hono middleware that validates a Bearer JWT via Supabase Auth.
 * Sets `c.var.userId` on success; returns 401 on failure.
 *
 * TODO(M1): Add rate-limiting to this middleware once infra is wired.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  const {
    data: { user },
    error,
  } = await getSupabaseAdmin().auth.getUser(token);

  if (error || !user) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('userId', user.id);
  await next();
};

/** Type-safe helper to read the authenticated user id from context. */
export function getUserId(c: Context): string {
  return c.get('userId');
}
