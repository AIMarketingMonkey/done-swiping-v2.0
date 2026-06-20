import { Hono } from 'hono';
import { reportInputSchema, blockInputSchema } from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { writeAudit } from '../lib/audit.js';

const report = new Hono();

/**
 * POST /report
 *
 * Submits a safety report against another user; inserts into `reports`
 * (status 'open') for the moderation queue.
 * TODO(M7): notify moderators on submit / auto-action critical-severity reports.
 */
report.post('/report', requireAuth, async (c) => {
  const userId = getUserId(c);

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = reportInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const { reported, reason } = parsed.data;

  if (userId === reported) {
    return c.json({ error: 'Cannot report yourself' }, 400);
  }

  const supabase = getSupabaseAdmin();

  const { data: insertedReport, error: insertError } = await supabase
    .from('reports')
    .insert({ reporter: userId, reported, reason, status: 'open' })
    .select('id')
    .single();

  if (insertError || !insertedReport) {
    console.error('[report] Failed to insert report:', insertError?.message);
    return c.json({ error: 'Failed to submit report' }, 500);
  }

  await writeAudit({
    actor: userId,
    action: 'safety.report_submitted',
    target: reported,
    payload: { reason_length: reason.length, report_id: insertedReport.id },
  });

  return c.json({ id: insertedReport.id as number }, 200);
});

/**
 * POST /block
 *
 * Blocks another user (upsert into `blocks`). The M4 matching safety gate
 * already excludes blocked pairs in both directions from future matches.
 */
report.post('/block', requireAuth, async (c) => {
  const userId = getUserId(c);

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = blockInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const { blocked } = parsed.data;

  if (userId === blocked) {
    return c.json({ error: 'Cannot block yourself' }, 400);
  }

  const supabase = getSupabaseAdmin();

  const { error: upsertError } = await supabase
    .from('blocks')
    .upsert(
      { blocker: userId, blocked },
      { onConflict: 'blocker,blocked', ignoreDuplicates: true },
    );

  if (upsertError) {
    console.error('[block] Failed to upsert block:', upsertError.message);
    return c.json({ error: 'Failed to apply block' }, 500);
  }

  await writeAudit({
    actor: userId,
    action: 'safety.block_applied',
    target: blocked,
  });

  return c.body(null, 204);
});

export default report;
