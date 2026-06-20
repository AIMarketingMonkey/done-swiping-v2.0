import { Hono } from 'hono';
import { consentSubmitSchema } from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { writeAudit } from '../lib/audit.js';
import { rateLimit } from '../lib/rate-limit.js';
import { track } from '../lib/analytics.js';

const consent = new Hono();

/**
 * POST /consent
 *
 * Records explicit consent choices for the authenticated user.  Each item in
 * the `consents` array is upserted into the `consents` table.
 *
 * The service-role client is used (bypasses RLS) and all writes are explicitly
 * scoped to the authenticated `userId` — the client cannot write another user's
 * consent rows.
 *
 * Body: consentSubmitSchema — { consents: [{ scope, granted, version }] }
 * Response: { recorded: number }
 */
consent.post('/', rateLimit({ windowMs: 60_000, max: 30 }), requireAuth, async (c) => {
  const userId = getUserId(c);

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = consentSubmitSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const { consents } = parsed.data;

  // Build rows with the server-authoritative user_id and timestamp.
  const rows = consents.map((item) => ({
    user_id: userId,
    scope: item.scope,
    granted: item.granted,
    version: item.version,
    granted_at: new Date().toISOString(),
  }));

  const supabase = getSupabaseAdmin();
  const { error: insertError } = await supabase
    .from('consents')
    .upsert(rows, { onConflict: 'user_id,scope' });

  if (insertError) {
    console.error('[consent] Failed to record consents:', insertError.message);
    return c.json({ error: 'Failed to record consents' }, 500);
  }

  // Single audit entry covering all scopes in this submission.
  await writeAudit({
    actor: userId,
    action: 'consent.record',
    target: userId,
    payload: {
      scopes: consents.map((c) => c.scope),
      version: consents[0]?.version ?? null,
      count: consents.length,
    },
  });

  track('consent.recorded', userId, {
    count: rows.length,
    version: consents[0]?.version ?? null,
  });

  return c.json({ recorded: rows.length }, 200);
});

export default consent;
