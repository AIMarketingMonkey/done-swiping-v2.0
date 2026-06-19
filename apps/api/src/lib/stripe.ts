import Stripe from 'stripe';
import { requireEnv } from '../env.js';

let _client: Stripe | null = null;

/** Returns a lazily-initialised Stripe client. Throws if secret key missing. */
export function getStripeClient(): Stripe {
  if (_client) return _client;
  _client = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
    apiVersion: '2025-02-24.acacia',
  });
  return _client;
}
