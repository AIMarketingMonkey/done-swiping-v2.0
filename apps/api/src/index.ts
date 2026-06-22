import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { API_ROUTES } from '@done-swiping/shared';
import { env } from './env.js';
import { initSentry, captureError } from './lib/observability.js';
import { requestLogger, logger } from './lib/logger.js';
import sessionRoutes from './routes/session.js';
import idvWebhookRoutes from './routes/idv-webhook.js';
import idvSessionRoutes from './routes/idv-session.js';
import idvDevRoutes from './routes/idv-dev.js';
import consentRoutes from './routes/consent.js';
import stripeWebhookRoutes from './routes/stripe-webhook.js';
import memoryRoutes from './routes/memory.js';
import matchesRoutes from './routes/matches.js';
import reportRoutes from './routes/report.js';
import adminRoutes from './routes/admin.js';
import billingRoutes from './routes/billing.js';

// Initialise Sentry as early as possible (no-op when SENTRY_DSN is unset).
initSentry();

const app = new Hono();

// --- Request logging (must be first middleware) ---------------------------
// Logs method, matched-path pattern, status, duration, requestId.
// Does NOT log raw URLs or query strings — avoids leaking tokens.
app.use('*', requestLogger);

// --- Health check -----------------------------------------------------------
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: '@done-swiping/api',
    timestamp: new Date().toISOString(),
  }),
);

// --- Route mounts -----------------------------------------------------------
// Session (voice session token issuance)
app.route(API_ROUTES.sessionStart, sessionRoutes);

// IDV — session creation (authenticated)
app.route(API_ROUTES.idvSession, idvSessionRoutes);

// IDV — dev-mock complete endpoint.
// WARNING: Only mounted when IDV_DEV_MODE=true.  Must never be active in production.
if (env.IDV_DEV_MODE) {
  logger.warn(
    '[api] IDV_DEV_MODE=true — mounting /idv/dev/complete (dev-mock path). ' +
      'This MUST NOT be enabled in production.',
  );
  app.route('/idv/dev', idvDevRoutes);
}

// Consent recording (authenticated)
app.route(API_ROUTES.consent, consentRoutes);

// Webhooks — public endpoints, signature-verified inside the handler.
// NOTE: Stripe and IDV webhooks read the raw body for signature verification.
//       They are mounted BEFORE any JSON body-parser so the raw bytes are intact.
//       Rate limiting is intentionally NOT applied to /webhooks/* — third-party
//       retry logic requires unrestricted access; signature verification is the
//       defence here.
app.route(API_ROUTES.idvWebhook, idvWebhookRoutes);
app.route(API_ROUTES.stripeWebhook, stripeWebhookRoutes);

// Authenticated API routes
app.route(API_ROUTES.memory, memoryRoutes);
app.route(API_ROUTES.matches, matchesRoutes);

// Report and block share a router mounted at root (paths are /report, /block)
app.route('/', reportRoutes);

// Staff-gated moderation console
app.route('/admin', adminRoutes);

// Billing: Stripe checkout, portal, web→app return bridge, entitlement check.
// NOTE: The webhook route (POST /webhooks/stripe) is mounted above and reads the
// raw body BEFORE any JSON parsing — do not move it below a JSON body-parser.
// These billing routes use requireAuth internally; /billing/return is public.
app.route('/', billingRoutes);

// --- 404 catch-all ----------------------------------------------------------
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// --- Global error handler ---------------------------------------------------
// Captures the exception in Sentry (when configured) without leaking internals.
app.onError((err, c) => {
  logger.error('Unhandled error', {
    errMessage: err instanceof Error ? err.message : String(err),
    route: c.req.routePath ?? c.req.path,
    method: c.req.method,
  });
  captureError(err, {
    route: c.req.routePath ?? c.req.path,
    method: c.req.method,
  });
  return c.json({ error: 'Internal server error' }, 500);
});

// --- Server start -----------------------------------------------------------
// Render (and other PaaS hosts) inject PORT at runtime; fall back to API_PORT
// for local dev (default 8787).  Bind to 0.0.0.0 so the container is reachable.
const port = process.env['PORT'] ? Number(process.env['PORT']) : env.API_PORT;

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  logger.info(`@done-swiping/api listening`, { port: info.port });
  logger.info('Routes mounted', {
    routes: [
      'GET  /health',
      `POST ${API_ROUTES.sessionStart}`,
      `POST ${API_ROUTES.idvSession}`,
      ...(env.IDV_DEV_MODE ? ['POST /idv/dev/complete  [DEV ONLY]'] : []),
      `POST ${API_ROUTES.consent}`,
      `POST ${API_ROUTES.idvWebhook}`,
      `POST ${API_ROUTES.stripeWebhook}`,
      `GET  ${API_ROUTES.memory}`,
      'PUT  /memory/:id',
      'DELETE /memory/:id',
      `GET  ${API_ROUTES.memoryExport}`,
      `GET  ${API_ROUTES.matches}`,
      `POST ${API_ROUTES.report}`,
      `POST ${API_ROUTES.block}`,
      `GET  ${API_ROUTES.adminFlags}         [staff only]`,
      'POST /admin/flags/:id                 [staff only]',
      `GET  ${API_ROUTES.adminReports}       [staff only]`,
      'POST /admin/reports/:id               [staff only]',
      `POST ${API_ROUTES.billingCheckout}`,
      `POST ${API_ROUTES.billingPortal}`,
      'GET  /billing/return                  [public, web→app bridge]',
      `GET  ${API_ROUTES.entitlement}`,
    ],
  });
});

export default app;
