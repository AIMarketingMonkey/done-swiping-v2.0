import type { MiddlewareHandler } from 'hono';
import { getUserId } from './auth.js';
import { getSupabaseAdmin } from './supabase-admin.js';

/**
 * Hono middleware that checks the authenticated user's `profiles.is_staff` flag.
 *
 * Must run AFTER `requireAuth` (which sets `c.var.userId`). Returns 403 if the
 * user is not a staff member. The `is_staff` column is only set via service-role
 * or direct SQL — it can never be self-promoted through the API.
 */
export const requireStaff: MiddlewareHandler = async (c, next) => {
  const userId = getUserId(c);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('profiles')
    .select('is_staff')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[staff] Failed to fetch profile:', error.message);
    return c.json({ error: 'Internal server error' }, 500);
  }

  if (!data?.is_staff) {
    return c.json({ error: 'staff_only' }, 403);
  }

  await next();
};
