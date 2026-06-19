import { Hono } from 'hono';
import { memoryResponseSchema, memoryUpdateSchema } from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { writeAudit } from '../lib/audit.js';

const memory = new Hono();

// ---------------------------------------------------------------------------
// GET /memory
//
// Returns the authenticated user's stated facts (profile_attributes), inferred
// traits (inferred_traits), and preferences — shaped exactly as
// memoryResponseSchema.  Uses the service-role client; every query is
// explicitly scoped to the authenticated userId so RLS bypass is safe.
// ---------------------------------------------------------------------------
memory.get('/', requireAuth, async (c) => {
  const userId = getUserId(c);
  const supabase = getSupabaseAdmin();

  // Run all three queries in parallel.
  const [statedResult, inferredResult, preferencesResult] = await Promise.all([
    supabase
      .from('profile_attributes')
      .select('id, key, value, source, confidence')
      .eq('user_id', userId),
    supabase
      .from('inferred_traits')
      .select('id, trait_key, trait_value, confidence, source_turn_id, status')
      .eq('user_id', userId),
    supabase
      .from('preferences')
      .select('id, type, key, value, is_hard_filter')
      .eq('user_id', userId),
  ]);

  if (statedResult.error) {
    console.error('[memory] Failed to fetch profile_attributes:', statedResult.error.message);
    return c.json({ error: 'Failed to fetch memory' }, 500);
  }
  if (inferredResult.error) {
    console.error('[memory] Failed to fetch inferred_traits:', inferredResult.error.message);
    return c.json({ error: 'Failed to fetch memory' }, 500);
  }
  if (preferencesResult.error) {
    console.error('[memory] Failed to fetch preferences:', preferencesResult.error.message);
    return c.json({ error: 'Failed to fetch memory' }, 500);
  }

  // Validate and shape the response against the shared schema before sending.
  const body = memoryResponseSchema.parse({
    stated: statedResult.data ?? [],
    inferred: inferredResult.data ?? [],
    preferences: preferencesResult.data ?? [],
  });

  return c.json(body, 200);
});

// ---------------------------------------------------------------------------
// GET /memory/export
//
// GDPR Art. 20 data-portability endpoint.  Returns a complete machine-readable
// bundle of all data held about the authenticated user.
//
// Included: profiles row, profile_attributes[], inferred_traits[],
// preferences[], consents[], conversations[] (id, started_at, ended_at,
// summary — raw transcripts are short-retention and excluded by design).
//
// IMPORTANT: This route must be declared BEFORE /memory/:id to prevent Hono
// matching the literal path segment "export" as the :id parameter.
// ---------------------------------------------------------------------------
memory.get('/export', requireAuth, async (c) => {
  const userId = getUserId(c);
  const supabase = getSupabaseAdmin();

  const [
    profileResult,
    statedResult,
    inferredResult,
    preferencesResult,
    consentsResult,
    conversationsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('profile_attributes').select('*').eq('user_id', userId),
    supabase.from('inferred_traits').select('*').eq('user_id', userId),
    supabase.from('preferences').select('*').eq('user_id', userId),
    supabase.from('consents').select('*').eq('user_id', userId),
    // Conversations: id, started_at, ended_at, summary only.
    // Raw transcript turns and embedding vectors are intentionally excluded —
    // transcripts are short-retention data and must not appear in exports.
    supabase
      .from('conversations')
      .select('id, started_at, ended_at, summary')
      .eq('user_id', userId),
  ]);

  const errors = [
    profileResult.error,
    statedResult.error,
    inferredResult.error,
    preferencesResult.error,
    consentsResult.error,
    conversationsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    console.error(
      '[memory] Failed to assemble export bundle:',
      errors.map((e) => e?.message),
    );
    return c.json({ error: 'Failed to generate export' }, 500);
  }

  const bundle = {
    exported_at: new Date().toISOString(),
    profile: profileResult.data ?? null,
    stated_facts: statedResult.data ?? [],
    inferred_traits: inferredResult.data ?? [],
    preferences: preferencesResult.data ?? [],
    consents: consentsResult.data ?? [],
    conversations: conversationsResult.data ?? [],
  };

  await writeAudit({
    actor: userId,
    action: 'memory.export',
    target: userId,
    payload: {
      stated_count: (statedResult.data ?? []).length,
      inferred_count: (inferredResult.data ?? []).length,
      preferences_count: (preferencesResult.data ?? []).length,
    },
  });

  c.header('Content-Disposition', 'attachment; filename="done-swiping-export.json"');
  c.header('Content-Type', 'application/json');
  return c.json(bundle, 200);
});

// ---------------------------------------------------------------------------
// PUT /memory/:id
//
// Allows the authenticated user to correct a stated fact, confirm or reject an
// inferred trait, or toggle/update a preference. The `kind` field in the
// request body disambiguates which table to update.
//
// Allowed updates per kind:
//   stated     → value
//   inferred   → trait_value and/or status
//   preference → value and/or is_hard_filter
//
// NOTE: toggling `is_hard_filter` here is correct — this is an explicit user
// action (GDPR controller).  The AI model never sets hard filters itself.
// ---------------------------------------------------------------------------
memory.put('/:id', requireAuth, async (c) => {
  const userId = getUserId(c);
  const id = Number(c.req.param('id'));

  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'Invalid id — must be a positive integer' }, 400);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = memoryUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const { kind, value, trait_value, status, is_hard_filter } = parsed.data;
  const supabase = getSupabaseAdmin();

  if (kind === 'stated') {
    if (value === undefined) {
      return c.json({ error: 'Field "value" is required to update a stated item' }, 422);
    }
    const { data, error } = await supabase
      .from('profile_attributes')
      .update({ value })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, key, value, source, confidence')
      .maybeSingle();

    if (error) {
      console.error('[memory] Failed to update profile_attributes:', error.message);
      return c.json({ error: 'Failed to update memory item' }, 500);
    }
    if (!data) {
      return c.json({ error: 'Memory item not found or not owned by user' }, 404);
    }

    await writeAudit({
      actor: userId,
      action: 'memory.update',
      target: String(id),
      payload: { kind, id, fields: ['value'] },
    });

    return c.json(data, 200);
  }

  if (kind === 'inferred') {
    const updates: Record<string, unknown> = {};
    if (trait_value !== undefined) updates['trait_value'] = trait_value;
    if (status !== undefined) updates['status'] = status;

    if (Object.keys(updates).length === 0) {
      return c.json(
        { error: 'At least one of "trait_value" or "status" must be provided for inferred items' },
        422,
      );
    }

    const { data, error } = await supabase
      .from('inferred_traits')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, trait_key, trait_value, confidence, source_turn_id, status')
      .maybeSingle();

    if (error) {
      console.error('[memory] Failed to update inferred_traits:', error.message);
      return c.json({ error: 'Failed to update memory item' }, 500);
    }
    if (!data) {
      return c.json({ error: 'Memory item not found or not owned by user' }, 404);
    }

    await writeAudit({
      actor: userId,
      action: 'memory.update',
      target: String(id),
      payload: { kind, id, fields: Object.keys(updates) },
    });

    return c.json(data, 200);
  }

  // kind === 'preference'
  const updates: Record<string, unknown> = {};
  if (value !== undefined) updates['value'] = value;
  if (is_hard_filter !== undefined) updates['is_hard_filter'] = is_hard_filter;

  if (Object.keys(updates).length === 0) {
    return c.json(
      {
        error: 'At least one of "value" or "is_hard_filter" must be provided for preference items',
      },
      422,
    );
  }

  const { data, error } = await supabase
    .from('preferences')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, type, key, value, is_hard_filter')
    .maybeSingle();

  if (error) {
    console.error('[memory] Failed to update preferences:', error.message);
    return c.json({ error: 'Failed to update memory item' }, 500);
  }
  if (!data) {
    return c.json({ error: 'Memory item not found or not owned by user' }, 404);
  }

  await writeAudit({
    actor: userId,
    action: 'memory.update',
    target: String(id),
    payload: { kind, id, fields: Object.keys(updates) },
  });

  return c.json(data, 200);
});

// ---------------------------------------------------------------------------
// DELETE /memory/:id?kind=stated|inferred|preference
//
// GDPR erasure: deletes a single memory item from the appropriate table, then
// purges ALL of the user's rows in the `embeddings` table.
//
// Embedding purge rationale: embeddings are derived from the user's stated,
// inferred, and preference data.  After any item is deleted it is impossible to
// know which embedding vectors encoded that fact.  Rather than leaving stale
// vectors that violate the deletion request we remove all of the user's
// embeddings.  The extraction pipeline regenerates them on the next run with
// the remaining (post-deletion) profile data.  This is the correct GDPR
// approach — prefer over-deletion to under-deletion for special-category data.
//
// Returns 204 on success, 400 for a missing/invalid kind query param, and
// 404 when the item does not exist or is not owned by the caller.
// ---------------------------------------------------------------------------
memory.delete('/:id', requireAuth, async (c) => {
  const userId = getUserId(c);
  const id = Number(c.req.param('id'));
  const kind = c.req.query('kind') as string | undefined;

  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: 'Invalid id — must be a positive integer' }, 400);
  }

  if (!kind || !['stated', 'inferred', 'preference'].includes(kind)) {
    return c.json(
      { error: 'Query param "kind" is required and must be stated, inferred, or preference' },
      400,
    );
  }

  const supabase = getSupabaseAdmin();

  // Delete from the appropriate table, scoped to userId.
  let deleteError: { message: string } | null = null;
  let rowDeleted = false;

  if (kind === 'stated') {
    // First confirm ownership then delete, so we can distinguish 404 vs error.
    const { data: existing } = await supabase
      .from('profile_attributes')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      return c.json({ error: 'Memory item not found or not owned by user' }, 404);
    }

    const { error } = await supabase
      .from('profile_attributes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    deleteError = error;
    rowDeleted = !error;
  } else if (kind === 'inferred') {
    const { data: existing } = await supabase
      .from('inferred_traits')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      return c.json({ error: 'Memory item not found or not owned by user' }, 404);
    }

    const { error } = await supabase
      .from('inferred_traits')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    deleteError = error;
    rowDeleted = !error;
  } else {
    // kind === 'preference'
    const { data: existing } = await supabase
      .from('preferences')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      return c.json({ error: 'Memory item not found or not owned by user' }, 404);
    }

    const { error } = await supabase
      .from('preferences')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    deleteError = error;
    rowDeleted = !error;
  }

  if (!rowDeleted || deleteError) {
    console.error('[memory] Failed to delete memory item:', deleteError?.message);
    return c.json({ error: 'Failed to delete memory item' }, 500);
  }

  // GDPR embedding purge — delete ALL of this user's embedding rows.
  //
  // We cannot determine which embeddings encoded the deleted fact, so the safe
  // choice is to purge all vectors for the user.  The extraction pipeline will
  // regenerate them from the remaining profile data on the next scheduled run.
  // This ensures the deleted item is not retained in the pgvector index.
  const { error: embeddingError } = await supabase
    .from('embeddings')
    .delete()
    .eq('user_id', userId);

  if (embeddingError) {
    // Log but do not fail the request — the primary deletion succeeded and the
    // user's GDPR right is satisfied.  Stale embeddings are a correctness issue
    // (not a privacy breach by themselves) and will be regenerated regardless.
    console.error('[memory] Failed to purge user embeddings:', embeddingError.message);
  }

  await writeAudit({
    actor: userId,
    action: 'memory.delete',
    target: userId,
    payload: {
      kind,
      id,
      embeddings_purged: !embeddingError,
    },
  });

  return c.body(null, 204);
});

export default memory;
