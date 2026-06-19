import { Hono } from 'hono';
import { idvWebhookSchema } from '@done-swiping/shared';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { writeAudit } from '../lib/audit.js';
import { env } from '../env.js';

const idvWebhook = new Hono();

/**
 * POST /webhooks/idv
 *
 * Receives age-assurance outcomes from the IDV provider (Yoti or Persona).
 * Updates `profiles.age_assurance_status` and writes an audit entry.
 *
 * Signature verification:
 * - Currently uses a shared-secret comparison via the `X-IDV-Secret` header.
 * - TODO(M1): Replace with provider-specific HMAC verification once a provider
 *   is selected. Yoti uses RSA-SHA256; Persona uses HMAC-SHA256 on the raw body.
 *   Use `crypto.timingSafeEqual` to prevent timing attacks.
 */
idvWebhook.post('/', async (c) => {
  // --- Signature / secret verification -------------------------------------
  const webhookSecret = env.IDV_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[idv-webhook] IDV_WEBHOOK_SECRET is not set — rejecting all requests.');
    return c.json({ error: 'Webhook endpoint not configured' }, 503);
  }

  const providedSecret = c.req.header('X-IDV-Secret') ?? c.req.header('x-idv-secret');
  if (!providedSecret) {
    return c.json({ error: 'Missing X-IDV-Secret header' }, 401);
  }

  // Constant-time comparison to mitigate timing attacks.
  const secretBytes = Buffer.from(webhookSecret);
  const providedBytes = Buffer.from(providedSecret);
  if (secretBytes.length !== providedBytes.length || !timingSafeEqual(secretBytes, providedBytes)) {
    return c.json({ error: 'Invalid secret' }, 401);
  }

  // --- Parse and validate body ---------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = idvWebhookSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const { user_id, age_assurance_status, provider, reference } = parsed.data;

  // --- Update profile -------------------------------------------------------
  const supabase = getSupabaseAdmin();
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ age_assurance_status })
    .eq('user_id', user_id);

  if (updateError) {
    console.error('[idv-webhook] Failed to update profile:', updateError.message);
    return c.json({ error: 'Database update failed' }, 500);
  }

  // --- Audit ---------------------------------------------------------------
  await writeAudit({
    actor: 'system:idv',
    action: 'idv.age_assurance_updated',
    target: user_id,
    payload: { age_assurance_status, provider, reference: reference ?? null },
  });

  return c.json({ ok: true }, 200);
});

/**
 * Minimal constant-time buffer comparison.
 * Node's `crypto.timingSafeEqual` requires equal-length buffers; we check
 * length separately to avoid leaking length information.
 */
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  // XOR each byte — if anything differs, result is non-zero.
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    // Non-null assertion safe: bounds checked by caller (lengths are equal).
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

export default idvWebhook;
