/**
 * src/lib/analytics.ts — lightweight product analytics stub.
 *
 * `track()` currently logs a structured `analytics` line to stdout.
 * TODO: forward events to a real analytics sink (Amplitude, PostHog, Mixpanel,
 * or a custom Supabase events table) before going to production.
 *
 * Rules (non-negotiable):
 *  - Never include PII in `props` (no email, name, phone, transcript content).
 *  - `userId` is a UUID (opaque identifier) — that is acceptable for analytics.
 *  - Keep `props` to safe structural metadata: plan tier, count, boolean flags.
 *
 * Usage:
 *   import { track } from './analytics.js';
 *   track('session.start', userId, { room });
 *   track('consent.recorded', userId, { scopes: ['voice', 'profile'], count: 2 });
 *   track('match.computed', userId, { candidates: 12, stored: 5 });
 *   track('checkout.started', userId, { checkoutSessionId });  // no price/currency PII
 *   track('subscription.activated', undefined, { customerId }); // webhook — userId may be unknown
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SafeProps = Record<string, string | number | boolean | null | undefined>;

// ---------------------------------------------------------------------------
// Internal emitter
// ---------------------------------------------------------------------------

function _emit(event: string, userId: string | undefined, props: SafeProps): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'info' as const,
    msg: 'analytics',
    event,
    userId: userId ?? null,
    ...props,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track a product event.
 *
 * @param event   - Snake-case event name, e.g. `'session.start'`.
 * @param userId  - Supabase user UUID.  Pass `undefined` for system events
 *                  where the user id is not available (webhook handlers).
 * @param props   - Optional safe, non-PII properties.
 */
export function track(event: string, userId?: string, props?: SafeProps): void {
  // TODO: replace/supplement this with a real analytics sink.
  _emit(event, userId, props ?? {});
}
