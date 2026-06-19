import { Hono } from 'hono';
import { reportInputSchema, blockInputSchema } from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';

const report = new Hono();

/**
 * POST /report
 *
 * Submits a safety report against another user.
 *
 * TODO(M5): Insert into `reports` table, trigger moderation queue notification,
 *   and optionally apply an auto-shadow-ban for critical severity flags.
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

  await writeAudit({
    actor: userId,
    action: 'safety.report_submitted',
    target: reported,
    payload: { reason_length: reason.length },
  });

  // TODO(M5): Insert into `reports` table and return the real row id.
  return c.json({ id: 'stub' }, 200);
});

/**
 * POST /block
 *
 * Blocks another user. Mutual-blocking prevents any future matching or contact.
 *
 * TODO(M5): Upsert into `blocks` table (blocker, blocked). Ensure the matching
 *   worker excludes blocked pairs. Return 204 on success.
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

  await writeAudit({
    actor: userId,
    action: 'safety.block_applied',
    target: blocked,
  });

  // TODO(M5): Upsert into `blocks` table.
  return c.body(null, 204);
});

export default report;
