import { Hono } from 'hono';
import { matchesResponseSchema } from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';

const matches = new Hono();

/**
 * GET /matches
 *
 * Returns the authenticated user's current match suggestions.
 *
 * TODO(M4): Query the `matches` table filtered to the authenticated user,
 *   join on profiles for the candidate's public display data, and return
 *   paginated results. Trigger the matching worker if no suggestions exist.
 */
matches.get('/', requireAuth, async (c) => {
  // TODO(M4): Replace with real query against `matches` table.
  // userId will be used for filtering once the matches table is queried.
  void getUserId(c);

  const body = matchesResponseSchema.parse({ matches: [] });
  return c.json(body, 200);
});

export default matches;
