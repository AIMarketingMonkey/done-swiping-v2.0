import { Hono } from 'hono';
import { AccessToken } from 'livekit-server-sdk';
import { FREE_VOICE_SESSION_LIMIT, sessionStartResponseSchema } from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
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

  // --- Age-gate (M1) --------------------------------------------------------
  // The user must have a passing age-assurance result before they can start a
  // voice session.  We load the profile via the service-role client (bypasses
  // RLS) and explicitly scope to the authed userId.
  const supabase = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('age_assurance_status')
    .eq('user_id', userId)
    .single();

  if (profileError || !profile) {
    console.error('[session] Failed to load profile for age-gate:', profileError?.message);
    return c.json({ error: 'Could not verify age assurance status' }, 500);
  }

  if (profile.age_assurance_status !== 'pass') {
    return c.json({ error: 'age_assurance_required' }, 403);
  }
  // --------------------------------------------------------------------------

  // --- Entitlement gate (M6) ------------------------------------------------
  // Premium users get unlimited voice sessions; free-tier users are capped at
  // FREE_VOICE_SESSION_LIMIT. We count all conversations for the user.
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();

  const isPremium = sub?.status === 'active' || sub?.status === 'trialing';

  if (!isPremium) {
    const { count, error: countError } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error(
        '[session] Failed to count conversations for entitlement gate:',
        countError.message,
      );
      return c.json({ error: 'Could not verify entitlement' }, 500);
    }

    if ((count ?? 0) >= FREE_VOICE_SESSION_LIMIT) {
      return c.json({ error: 'premium_required' }, 402);
    }
  }
  // --------------------------------------------------------------------------

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
