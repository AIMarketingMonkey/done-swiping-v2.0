/**
 * ============================================================
 * WARNING — DEV-MOCK ONLY.  NEVER ENABLE IN PRODUCTION.
 * ============================================================
 * This route simulates a Yoti age-assurance callback so the
 * whole M1 flow can be exercised locally without a real Yoti
 * account.  It is only mounted when IDV_DEV_MODE=true (see
 * src/index.ts).  Production deployments must set
 * IDV_DEV_MODE=false (or leave it unset) so this file is
 * never reachable.
 * ============================================================
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, getUserId } from '../lib/auth.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { writeAudit } from '../lib/audit.js';

const idvDev = new Hono();

// Inline body schema — only the status field, defaulting to 'pass'.
const devCompleteBodySchema = z.object({
  status: z.enum(['pending', 'pass', 'fail'] as const).default('pass'),
});

/**
 * POST /idv/dev/complete
 *
 * Simulates a Yoti IDV result.  Sets `profiles.age_assurance_status` for the
 * authenticated user to the requested status (default: 'pass').
 *
 * Body: { status?: 'pass' | 'fail' | 'pending' }
 *
 * This endpoint is ONLY reachable when IDV_DEV_MODE=true (enforced in index.ts).
 */
idvDev.post('/complete', requireAuth, async (c) => {
  const userId = getUserId(c);

  // Parse body (best-effort; fall back to empty object so default kicks in)
  let rawBody: unknown = {};
  try {
    rawBody = await c.req.json();
  } catch {
    // empty / missing body is fine — we default status to 'pass'
  }

  const parsed = devCompleteBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Invalid body', details: parsed.error.flatten() }, 400);
  }

  const { status } = parsed.data;

  // Update the user's profile via the service-role client (bypasses RLS;
  // explicitly scoped to the authed userId).
  const supabase = getSupabaseAdmin();
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ age_assurance_status: status })
    .eq('user_id', userId);

  if (updateError) {
    console.error('[idv-dev] Failed to update profile:', updateError.message);
    return c.json({ error: 'Database update failed' }, 500);
  }

  await writeAudit({
    actor: userId,
    action: 'idv.dev.complete',
    target: userId,
    payload: { simulated_status: status },
  });

  return c.json({ ok: true, simulated_status: status }, 200);
});

export default idvDev;
