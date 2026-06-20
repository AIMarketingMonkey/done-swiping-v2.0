import { Hono } from 'hono';
import { createHash, randomUUID } from 'node:crypto';
import { idvSessionResponseSchema } from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { rateLimit } from '../lib/rate-limit.js';
import { env } from '../env.js';

const idvSession = new Hono();

// ---------------------------------------------------------------------------
// Yoti integration (production path)
// ---------------------------------------------------------------------------

/**
 * Creates a Yoti Identity / Age-Estimation session for the given user.
 *
 * TODO(M1 — Yoti): Replace the body of this function with a real Yoti API call:
 *   1. Load the PEM private key from `env.IDV_PEM` (PEM string or path).
 *   2. POST to https://api.yoti.com/idverify/v1/sessions with:
 *        - `Authorization: Bearer <IDV_API_KEY>`
 *        - `X-Yoti-SDK-ID: <IDV_SDK_ID>`
 *        - Body: session config (requested_checks, required_documents, etc.)
 *   3. Sign the request body with the PEM key using RSA-SHA256 (Yoti's
 *      "Client-SDK-Digest" header scheme — see Yoti doc page
 *      "Creating a session / Request signing").
 *   4. Map the Yoti response `{ session_id, client_session_token }` into the
 *      return value below.
 *
 * References:
 *   https://developers.yoti.com/age-verification/integration-guide
 *   https://developers.yoti.com/identity-verification/get-started
 */
async function createYotiSession(
  _userId: string,
): Promise<{ provider: 'yoti'; session_id: string; client_session_token: string }> {
  // Guard: require Yoti credentials before attempting any network call.
  if (!env.IDV_SDK_ID || !env.IDV_PEM || !env.IDV_API_KEY) {
    throw new Error(
      'Yoti not configured: IDV_SDK_ID, IDV_PEM, and IDV_API_KEY must all be set ' +
        'to use the real Yoti IDV integration. Set IDV_DEV_MODE=true for local testing.',
    );
  }

  // TODO(M1 — Yoti): Implement the actual Yoti session API call here (see above).
  // Placeholder to satisfy the type system until the real call is wired in.
  void createHash; // imported for use in the real signing implementation
  throw new Error('createYotiSession: real Yoti integration not yet implemented (TODO M1).');
}

// ---------------------------------------------------------------------------
// Route: POST /idv/session
// ---------------------------------------------------------------------------

/**
 * POST /idv/session
 *
 * Creates an IDV (age-assurance) session for the authenticated user and returns
 * the credentials the mobile client needs to launch the Yoti SDK.
 *
 * In dev-mock mode (`IDV_DEV_MODE=true`) no Yoti credentials are required; a
 * synthetic session is returned immediately and a companion GET endpoint lets
 * testers simulate a pass/fail result.
 */
idvSession.post('/', rateLimit({ windowMs: 60_000, max: 30 }), requireAuth, async (c) => {
  const userId = getUserId(c);

  let responseBody: ReturnType<typeof idvSessionResponseSchema.parse>;

  if (env.IDV_DEV_MODE) {
    // ------------------------------------------------------------------
    // DEV-MOCK PATH — never enabled in production
    // ------------------------------------------------------------------
    const sessionId = `dev-${randomUUID()}`;
    const devCompleteUrl = `${env.API_PUBLIC_URL ?? 'http://localhost:8787'}/idv/dev/complete?session=${sessionId}`;

    responseBody = idvSessionResponseSchema.parse({
      provider: 'yoti',
      session_id: sessionId,
      url: devCompleteUrl,
    });
  } else {
    // ------------------------------------------------------------------
    // PRODUCTION PATH — real Yoti call
    // ------------------------------------------------------------------
    let yotiResult: { provider: 'yoti'; session_id: string; client_session_token: string };
    try {
      yotiResult = await createYotiSession(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[idv-session] Failed to create Yoti session:', message);
      return c.json({ error: message }, 501);
    }

    responseBody = idvSessionResponseSchema.parse(yotiResult);
  }

  // Audit regardless of path
  await writeAudit({
    actor: userId,
    action: 'idv.session.start',
    target: userId,
    payload: {
      provider: 'yoti',
      session_id: responseBody.session_id,
      dev_mode: env.IDV_DEV_MODE,
    },
  });

  return c.json(responseBody, 200);
});

export default idvSession;
