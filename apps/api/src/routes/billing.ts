import { Hono } from 'hono';
import {
  API_ROUTES,
  checkoutResponseSchema,
  entitlementResponseSchema,
  portalResponseSchema,
} from '@done-swiping/shared';
import { requireAuth, getUserId } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { env } from '../env.js';

const billing = new Hono();

// ---------------------------------------------------------------------------
// POST /billing/checkout
// Ensure a Stripe Customer exists for the user, then create a Checkout Session.
// ---------------------------------------------------------------------------
billing.post(API_ROUTES.billingCheckout, requireAuth, async (c) => {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_PREMIUM) {
    return c.json(
      {
        error: 'Stripe or the premium price is not configured on this server.',
        hint: 'Set STRIPE_SECRET_KEY and STRIPE_PRICE_PREMIUM in your .env file.',
      },
      501,
    );
  }

  const userId = getUserId(c);
  const supabase = getSupabaseAdmin();
  const { getStripeClient } = await import('../lib/stripe.js');
  const stripe = getStripeClient();

  // --- Resolve or create a Stripe Customer for this user --------------------
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  let customerId: string;

  if (sub?.stripe_customer_id) {
    customerId = sub.stripe_customer_id;
  } else {
    // Fetch the user's email so Stripe can pre-fill the checkout form.
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const customer = await stripe.customers.create({
      email: userData?.user?.email ?? undefined,
      metadata: { user_id: userId },
    });
    customerId = customer.id;

    // Persist the new customer id (upsert — the row may not exist yet).
    await supabase
      .from('subscriptions')
      .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' });
  }

  // --- Create the Checkout Session ------------------------------------------
  const publicUrl = env.API_PUBLIC_URL ?? '';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: env.STRIPE_PRICE_PREMIUM, quantity: 1 }],
    subscription_data: { metadata: { user_id: userId } },
    success_url: `${publicUrl}/billing/return?status=success`,
    cancel_url: `${publicUrl}/billing/return?status=cancel`,
  });

  await writeAudit({
    actor: userId,
    action: 'billing.checkout',
    target: userId,
    payload: { checkout_session_id: session.id, customer_id: customerId },
  });

  const body = checkoutResponseSchema.parse({ url: session.url });
  return c.json(body, 200);
});

// ---------------------------------------------------------------------------
// GET /billing/return
// No auth — web→app bridge. Stripe requires https success/cancel URLs so we
// bounce through here and redirect into the deep-link scheme.
// ---------------------------------------------------------------------------
billing.get('/billing/return', (c) => {
  const status = c.req.query('status') ?? 'unknown';
  // Sanitise: only allow known status values to prevent open-redirect abuse.
  const safeStatus = ['success', 'cancel', 'portal'].includes(status) ? status : 'unknown';

  const deepLink = `${env.APP_DEEP_LINK}paywall?status=${safeStatus}`;
  const escaped = deepLink.replace(/"/g, '&quot;');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Returning to Done Swiping…</title>
  <meta http-equiv="refresh" content="0;url=${escaped}">
  <style>
    body { font-family: system-ui, sans-serif; display:flex; flex-direction:column;
           align-items:center; justify-content:center; min-height:100vh; margin:0;
           background:#fafafa; color:#111; }
    a { color:#6d28d9; font-weight:600; }
  </style>
</head>
<body>
  <p>Redirecting you back to the app…</p>
  <p><a href="${escaped}">Tap here if you are not redirected automatically.</a></p>
</body>
</html>`;

  return c.html(html, 200);
});

// ---------------------------------------------------------------------------
// POST /billing/portal
// Create a Stripe Billing Portal session for an existing customer.
// ---------------------------------------------------------------------------
billing.post(API_ROUTES.billingPortal, requireAuth, async (c) => {
  if (!env.STRIPE_SECRET_KEY) {
    return c.json(
      {
        error: 'Stripe is not configured on this server.',
        hint: 'Set STRIPE_SECRET_KEY in your .env file.',
      },
      501,
    );
  }

  const userId = getUserId(c);
  const supabase = getSupabaseAdmin();

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return c.json({ error: 'No billing account found for this user.' }, 404);
  }

  const { getStripeClient } = await import('../lib/stripe.js');
  const stripe = getStripeClient();

  const publicUrl = env.API_PUBLIC_URL ?? '';
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${publicUrl}/billing/return?status=portal`,
  });

  await writeAudit({
    actor: userId,
    action: 'billing.portal',
    target: userId,
    payload: { customer_id: sub.stripe_customer_id },
  });

  const body = portalResponseSchema.parse({ url: portalSession.url });
  return c.json(body, 200);
});

// ---------------------------------------------------------------------------
// GET /me/entitlement
// Read subscription status for the authenticated user.
// ---------------------------------------------------------------------------
billing.get(API_ROUTES.entitlement, requireAuth, async (c) => {
  const userId = getUserId(c);
  const supabase = getSupabaseAdmin();

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();

  if (!sub) {
    const body = entitlementResponseSchema.parse({
      premium: false,
      tier: 'free',
      status: null,
      current_period_end: null,
    });
    return c.json(body, 200);
  }

  const premium = sub.status === 'active' || sub.status === 'trialing';

  const body = entitlementResponseSchema.parse({
    premium,
    tier: premium ? 'premium' : 'free',
    status: sub.status ?? null,
    current_period_end: sub.current_period_end ?? null,
  });
  return c.json(body, 200);
});

export default billing;
