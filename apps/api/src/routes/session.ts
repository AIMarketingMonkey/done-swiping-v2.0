import { Hono } from 'hono';
import { AccessToken } from 'livekit-server-sdk';
import { sessionStartResponseSchema } from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { env } from '../env.js';

const session = new Hono();

/**
 * POST /session/start
 *
 * Issues a LiveKit room token for the authenticated user and returns the
 * connection details the mobile client needs to join a voice session.
 *
 * TODO(M6): Check `subscriptions` table for entitlement before issuing token.
 * TODO(M2): Generate a stable room id per-conversation rather than always
 *            using the onboarding room; store conversation record in DB.
 */
session.post('/start', requireAuth, async (c) => {
  const userId = getUserId(c);

  // Guard: LiveKit config must be present to serve this endpoint.
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    return c.json(
      {
        error: 'LiveKit is not configured on this server.',
        hint: 'Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in your .env file.',
      },
      501,
    );
  }

  const room = `onboarding-${userId}`;

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId,
    // Token valid for 4 hours — long enough for any foreseeable session.
    ttl: '4h',
  });
  at.addGrant({ roomJoin: true, room });

  const token = await at.toJwt();

  const responseBody = sessionStartResponseSchema.parse({
    livekit_url: env.LIVEKIT_URL,
    token,
    room,
  });

  await writeAudit({
    actor: userId,
    action: 'session.start',
    target: userId,
    payload: { room },
  });

  return c.json(responseBody, 200);
});

export default session;
