import { Hono } from 'hono';
import { memoryResponseSchema, memoryUpdateSchema } from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';

const memory = new Hono();

/**
 * GET /memory
 *
 * Returns the authenticated user's stated facts, inferred traits, and
 * preferences.
 *
 * TODO(M3): Query profile_attributes, inferred_traits, and preferences tables
 *   from the admin client and return real data.
 */
memory.get('/', requireAuth, async (c) => {
  // TODO(M3): Replace with real DB queries scoped to getUserId(c).
  void getUserId(c);

  const body = memoryResponseSchema.parse({
    stated: [],
    inferred: [],
    preferences: [],
  });

  return c.json(body, 200);
});

/**
 * GET /memory/export
 *
 * GDPR Art. 20 data portability: returns a machine-readable bundle of
 * everything held about the user.
 *
 * TODO(M3): Assemble full export bundle (profile, memory, embeddings metadata,
 *   conversation summaries). Trigger via Resend email for large exports.
 *
 * IMPORTANT: This route must be declared BEFORE /memory/:id to avoid
 * Hono matching "export" as the :id segment.
 */
memory.get('/export', requireAuth, async (c) => {
  const userId = getUserId(c);

  // TODO(M3): Build and return a real GDPR export bundle.
  return c.json(
    {
      user_id: userId,
      exported_at: new Date().toISOString(),
      message: 'Full export not yet implemented.',
    },
    200,
  );
});

/**
 * PUT /memory/:id
 *
 * Allows the user to correct a stated fact, confirm/reject an inferred trait,
 * or toggle a preference into a hard filter.
 *
 * TODO(M3): Route to the correct table (profile_attributes / inferred_traits /
 *   preferences) based on `kind`, apply the update, and return the patched row.
 */
memory.put('/:id', requireAuth, async (c) => {
  // TODO(M3): use userId + id to scope the update.
  void getUserId(c);
  void c.req.param('id');

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

  // TODO(M3): Apply update to the correct table.
  return c.json({ message: 'Memory update not yet implemented.' }, 200);
});

/**
 * DELETE /memory/:id
 *
 * Deletes a memory item across all stores (DB row + embedding vectors).
 *
 * TODO(M3): Delete from profile_attributes / inferred_traits / preferences AND
 *   remove the associated vector from the embeddings table (and pgvector index).
 *   Return 204 on success, 404 if not found or not owned by caller.
 */
memory.delete('/:id', requireAuth, async (c) => {
  // TODO(M3): use userId + id to scope the deletion.
  void getUserId(c);
  void c.req.param('id');

  // TODO(M3): Delete from all stores including embeddings.
  return c.body(null, 204);
});

export default memory;
