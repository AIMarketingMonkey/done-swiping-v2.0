import { Hono } from 'hono';
import { timingSafeEqual, createHmac } from 'node:crypto';
import { idvWebhookSchema } from '@done-swiping/shared';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { writeAudit } from '../lib/audit.js';
import { env } from '../env.js';

const idvWebhook = new Hono();

/**
 * POST /webhooks/idv
 *
 * Receives age-assurance outcome notifications from Yoti and updates the
 * user's `profiles.age_assurance_status`.
 *
 * Signature verification:
 *   We currently verify an HMAC-SHA256 signature over the raw request body,
 *   delivered in the `X-Yoti-Signature` header.
 *
 *   TODO(M1 — Yoti): Confirm Yoti's actual notification-signing scheme and
 *   replace if needed.  Yoti's Identity Verification service typically signs
 *   using RSA-SHA256 with the partner private key and delivers the signature
 *   in `X-Yoti-Auth-Digest` (base64-encoded).  See:
 *   https://developers.yoti.com/identity-verification/webhook
 *   If Yoti uses RSA rather than HMAC, replace the HMAC verify block below
 *   with `crypto.createVerify('RSA-SHA256')` using `IDV_PEM` as the public key.
 */
idvWebhook.post('/', async (c) => {
  const webhookSecret = env.IDV_WEBHOOK_SECRET;

  // If secret is not configured and we are not in dev-mode, reject with 501.
  if (!webhookSecret && !env.IDV_DEV_MODE) {
    console.error('[idv-webhook] IDV_WEBHOOK_SECRET is not set — rejecting request.');
    return c.json({ error: 'Webhook endpoint not configured' }, 501);
  }

  // --- Read raw body BEFORE any JSON parsing (required for HMAC verification) ---
  const rawBody = await c.req.text();

  // --- Signature verification -----------------------------------------------
  if (!env.IDV_DEV_MODE) {
    // Production: verify HMAC-SHA256 over the raw body.
    const signatureHeader = c.req.header('X-Yoti-Signature') ?? c.req.header('x-yoti-signature');

    if (!signatureHeader) {
      return c.json({ error: 'Missing X-Yoti-Signature header' }, 401);
    }

    // webhookSecret is guaranteed non-null here (checked above).
    const expectedHmac = createHmac('sha256', webhookSecret!).update(rawBody).digest('hex');

    // Constant-time comparison to prevent timing attacks.
    const expectedBuf = Buffer.from(expectedHmac, 'utf8');
    const receivedBuf = Buffer.from(signatureHeader, 'utf8');

    const signaturesMatch =
      expectedBuf.length === receivedBuf.length && timingSafeEqual(expectedBuf, receivedBuf);

    if (!signaturesMatch) {
      return c.json({ error: 'Invalid signature' }, 401);
    }
  } else {
    // Dev-mode: log a warning so it is obvious in local output that verification
    // is being skipped.  A missing or invalid signature is silently allowed.
    console.warn(
      '[idv-webhook] IDV_DEV_MODE=true — signature verification is BYPASSED. ' +
        'This must never happen in production.',
    );
  }

  // --- Parse and validate body ----------------------------------------------
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = idvWebhookSchema.safeParse(rawJson);
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const { user_id, age_assurance_status, provider, reference } = parsed.data;

  // --- Update profile (service role — explicitly scoped to user_id) ---------
  const supabase = getSupabaseAdmin();
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ age_assurance_status })
    .eq('user_id', user_id);

  if (updateError) {
    console.error('[idv-webhook] Failed to update profile:', updateError.message);
    return c.json({ error: 'Database update failed' }, 500);
  }

  // --- Audit ----------------------------------------------------------------
  await writeAudit({
    actor: 'system:idv',
    action: 'idv.webhook',
    target: user_id,
    payload: { age_assurance_status, provider, reference: reference ?? null },
  });

  return c.json({ ok: true }, 200);
});

export default idvWebhook;
