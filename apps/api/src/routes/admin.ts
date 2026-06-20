import { Hono } from 'hono';
import {
  safetyFlagsResponseSchema,
  reportsResponseSchema,
  moderationActionSchema,
} from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';
import { requireStaff } from '../lib/staff.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { writeAudit } from '../lib/audit.js';

const admin = new Hono();

// All admin routes require both auth and staff status.
// We apply both middlewares at each route rather than using .use() on the
// sub-router so the middleware ordering is explicit and consistent.

// ---------------------------------------------------------------------------
// GET /admin/flags?status=open
//
// Lists safety_flags ordered newest-first, filtered by status (default 'open').
// Response validated against safetyFlagsResponseSchema.
// ---------------------------------------------------------------------------
admin.get('/flags', requireAuth, requireStaff, async (c) => {
  const status = c.req.query('status') ?? 'open';
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('safety_flags')
    .select('id, user_id, conversation_id, type, severity, status, reviewed_by, created_at')
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin] Failed to fetch safety_flags:', error.message);
    return c.json({ error: 'Failed to fetch flags' }, 500);
  }

  const body = safetyFlagsResponseSchema.parse({ flags: data ?? [] });
  return c.json(body, 200);
});

// ---------------------------------------------------------------------------
// POST /admin/flags/:id
//
// Updates a safety flag's status and records the reviewing staff member.
// Body validated against moderationActionSchema.
// ---------------------------------------------------------------------------
admin.post('/flags/:id', requireAuth, requireStaff, async (c) => {
  const staffId = getUserId(c);
  const flagId = Number(c.req.param('id'));

  if (Number.isNaN(flagId)) {
    return c.json({ error: 'Invalid flag id' }, 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = moderationActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const { status, note } = parsed.data;
  const supabase = getSupabaseAdmin();

  const { data: updated, error: updateError } = await supabase
    .from('safety_flags')
    .update({ status, reviewed_by: staffId })
    .eq('id', flagId)
    .select('id')
    .maybeSingle();

  if (updateError) {
    console.error('[admin] Failed to update safety_flag:', updateError.message);
    return c.json({ error: 'Failed to update flag' }, 500);
  }

  if (!updated) {
    return c.json({ error: 'Flag not found' }, 404);
  }

  await writeAudit({
    actor: staffId,
    action: 'admin.flag.action',
    target: String(flagId),
    payload: { status, note },
  });

  return c.json({ id: flagId as number }, 200);
});

// ---------------------------------------------------------------------------
// GET /admin/reports?status=open
//
// Lists user-submitted reports ordered newest-first, filtered by status.
// Response validated against reportsResponseSchema.
// ---------------------------------------------------------------------------
admin.get('/reports', requireAuth, requireStaff, async (c) => {
  const status = c.req.query('status') ?? 'open';
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('reports')
    .select('id, reporter, reported, reason, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin] Failed to fetch reports:', error.message);
    return c.json({ error: 'Failed to fetch reports' }, 500);
  }

  const body = reportsResponseSchema.parse({ reports: data ?? [] });
  return c.json(body, 200);
});

// ---------------------------------------------------------------------------
// POST /admin/reports/:id
//
// Updates a report's status.
// Body validated against moderationActionSchema.
// ---------------------------------------------------------------------------
admin.post('/reports/:id', requireAuth, requireStaff, async (c) => {
  const staffId = getUserId(c);
  const reportId = Number(c.req.param('id'));

  if (Number.isNaN(reportId)) {
    return c.json({ error: 'Invalid report id' }, 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = moderationActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const { status, note } = parsed.data;
  const supabase = getSupabaseAdmin();

  const { data: updated, error: updateError } = await supabase
    .from('reports')
    .update({ status })
    .eq('id', reportId)
    .select('id')
    .maybeSingle();

  if (updateError) {
    console.error('[admin] Failed to update report:', updateError.message);
    return c.json({ error: 'Failed to update report' }, 500);
  }

  if (!updated) {
    return c.json({ error: 'Report not found' }, 404);
  }

  await writeAudit({
    actor: staffId,
    action: 'admin.report.action',
    target: String(reportId),
    payload: { status, note },
  });

  return c.json({ id: reportId as number }, 200);
});

export default admin;
