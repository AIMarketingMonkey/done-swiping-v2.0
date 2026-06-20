/**
 * src/lib/observability.ts — Sentry initialisation + error capture helper.
 *
 * Sentry is initialised ONLY when SENTRY_DSN is set in the environment.
 * When the DSN is absent (local dev, CI without secrets) every call is a no-op.
 *
 * Usage:
 *   import { initSentry, captureError } from './observability.js';
 *   initSentry();                                   // call once at startup
 *   captureError(err, { route: '/foo' });           // in error handlers
 *
 * Important: never pass raw user content, secrets, or PII in the `context`
 * argument — keep it to safe structural metadata (route, status code, etc.).
 *
 * NOTE: `@sentry/node` must be installed (`pnpm install`) before this module
 * activates at runtime.  The `createRequire` guard lets the module load and
 * tsc type-check cleanly even when the package is not yet installed; Sentry
 * simply stays inactive until both SENTRY_DSN is set and the dep is present.
 */

import { createRequire } from 'node:module';
import { env } from '../env.js';

// Typed as `any` deliberately — @sentry/node types are only available once
// the package is installed.  All call sites are guarded by the `_sentry` null check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySentry = any;

let _sentry: AnySentry | null = null;
let _initialised = false;

const _require = createRequire(import.meta.url);

function _loadSentry(): AnySentry | null {
  try {
    return _require('@sentry/node');
  } catch {
    // Package not installed yet — no-op.
    return null;
  }
}

/**
 * Initialise Sentry once at process startup.
 * Safe to call multiple times — subsequent calls are no-ops.
 * Does nothing when SENTRY_DSN is unset or @sentry/node is not installed.
 */
export function initSentry(): void {
  if (_initialised) return;
  _initialised = true;

  if (!env.SENTRY_DSN) {
    return;
  }

  const Sentry = _loadSentry();
  if (!Sentry) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    // Disable default integrations that capture HTTP request bodies —
    // we never want user-authored content (transcript text, etc.) in Sentry.
    defaultIntegrations: false,
    // 10 % of transactions for performance monitoring.
    tracesSampleRate: 0.1,
    // Never send PII automatically.
    sendDefaultPii: false,
  });

  _sentry = Sentry;
}

/**
 * Capture an exception in Sentry (or no-op when Sentry is not active).
 *
 * @param err     - The error to report.
 * @param context - Optional safe, non-PII metadata (route, status code, etc.).
 *                  NEVER include user content, transcript text, or secrets.
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!_sentry) {
    return;
  }

  _sentry.withScope((scope: AnySentry) => {
    if (context) {
      scope.setContext('api', context);
    }
    _sentry.captureException(err);
  });
}
