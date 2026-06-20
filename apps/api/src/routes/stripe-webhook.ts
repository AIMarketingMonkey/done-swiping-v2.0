import type Stripe from 'stripe';
import { Hono } from 'hono';
import { writeAudit } from '../lib/audit.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { track } from '../lib/analytics.js';
import { env } from '../env.js';

const stripeWebhook = new Hono();

/**
 * POST /webhooks/stripe
 *
 * Verifies the Stripe-Signature header and dispatches event handlers.
 *
 * TODO(M6): Implement upsert logic into `subscriptions` table for
 *   `checkout.session.completed`, `customer.subscription.created`,
 *   `customer.subscription.updated`, `customer.subscription.deleted`.
 *
 * Raw body requirement: Hono's `c.req.raw` gives the unmodified Request object.
 * We read `arrayBuffer()` before any JSON parsing to avoid signature mismatch.
 */
stripeWebhook.post('/', async (c) => {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return c.json(
      {
        error: 'Stripe is not configured on this server.',
        hint: 'Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in your .env file.',
      },
      501,
    );
  }

  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing Stripe-Signature header' }, 400);
  }

  // Read raw body for signature verification (must happen before json()).
  const rawBody = await c.req.arrayBuffer();
  const rawBodyText = Buffer.from(rawBody).toString('utf-8');

  // Lazy-load Stripe client to keep startup fast when Stripe isn't configured.
  const { getStripeClient } = await import('../lib/stripe.js');
  const stripe = getStripeClient();

  let event: import('stripe').Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBodyText, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] Signature verification failed:', message);
    return c.json({ error: 'Webhook signature verification failed' }, 400);
  }

  // --- Event dispatch -------------------------------------------------------
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Attempt to resolve user_id from the session's client_reference_id or
      // subscription metadata. customer_id is always available here.
      const userId =
        session.client_reference_id ??
        (await resolveUserIdByCustomer(session.customer as string | null));

      if (userId && session.subscription) {
        // Fetch the subscription to get the full status + period end.
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription({
          userId,
          stripeCustomerId: session.customer as string,
          stripeSub,
        });
      }

      await writeAudit({
        actor: 'system:stripe',
        action: 'billing.webhook',
        payload: {
          event_id: event.id,
          event_type: event.type,
          user_id: userId ?? null,
          customer_id: session.customer ?? null,
        },
      });
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const userId =
        (stripeSub.metadata?.user_id as string | undefined) ??
        (await resolveUserIdByCustomer(
          typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id,
        ));

      if (userId) {
        await upsertSubscription({
          userId,
          stripeCustomerId:
            typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id,
          stripeSub,
        });
      }

      // Track subscription activation (no PII — status and tier only).
      if (stripeSub.status === 'active' || stripeSub.status === 'trialing') {
        track('subscription.activated', userId, {
          status: stripeSub.status,
          eventType: event.type,
        });
      }

      await writeAudit({
        actor: 'system:stripe',
        action: 'billing.webhook',
        payload: {
          event_id: event.id,
          event_type: event.type,
          user_id: userId ?? null,
          subscription_id: stripeSub.id,
        },
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const userId =
        (stripeSub.metadata?.user_id as string | undefined) ??
        (await resolveUserIdByCustomer(
          typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id,
        ));

      if (userId) {
        await upsertSubscription({
          userId,
          stripeCustomerId:
            typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id,
          stripeSub,
        });
      }

      await writeAudit({
        actor: 'system:stripe',
        action: 'billing.webhook',
        payload: {
          event_id: event.id,
          event_type: event.type,
          user_id: userId ?? null,
          subscription_id: stripeSub.id,
        },
      });
      break;
    }

    default:
      // Acknowledge unhandled events without error.
      break;
  }

  return c.json({ received: true }, 200);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a user_id by looking up the stripe_customer_id in the subscriptions
 * table. Returns undefined when no matching row exists.
 */
async function resolveUserIdByCustomer(customerId: string | null): Promise<string | undefined> {
  if (!customerId) return undefined;
  const { data } = await getSupabaseAdmin()
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.user_id ?? undefined;
}

/**
 * Upsert the `subscriptions` row from a Stripe Subscription object.
 * tier is 'premium' when active or trialing, else 'free'.
 */
async function upsertSubscription({
  userId,
  stripeCustomerId,
  stripeSub,
}: {
  userId: string;
  stripeCustomerId: string;
  stripeSub: Stripe.Subscription;
}): Promise<void> {
  const status = stripeSub.status;
  const tier = status === 'active' || status === 'trialing' ? 'premium' : 'free';
  const currentPeriodEnd =
    typeof stripeSub.current_period_end === 'number'
      ? new Date(stripeSub.current_period_end * 1000).toISOString()
      : null;

  const { error } = await getSupabaseAdmin().from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSub.id,
      tier,
      status,
      current_period_end: currentPeriodEnd,
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.error('[stripe-webhook] Failed to upsert subscription:', error.message);
  }
}

export default stripeWebhook;
