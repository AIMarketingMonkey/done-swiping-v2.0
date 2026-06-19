import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { API_ROUTES } from '@done-swiping/shared';
import { env } from './env.js';
import sessionRoutes from './routes/session.js';
import idvWebhookRoutes from './routes/idv-webhook.js';
import stripeWebhookRoutes from './routes/stripe-webhook.js';
import memoryRoutes from './routes/memory.js';
import matchesRoutes from './routes/matches.js';
import reportRoutes from './routes/report.js';

const app = new Hono();

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

// Webhooks — public endpoints, signature-verified inside the handler
app.route(API_ROUTES.idvWebhook, idvWebhookRoutes);
app.route(API_ROUTES.stripeWebhook, stripeWebhookRoutes);

// Authenticated API routes
app.route(API_ROUTES.memory, memoryRoutes);
app.route(API_ROUTES.matches, matchesRoutes);

// Report and block share a router mounted at root (paths are /report, /block)
app.route('/', reportRoutes);

// --- 404 catch-all ----------------------------------------------------------
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// --- Global error handler ---------------------------------------------------
app.onError((err, c) => {
  console.error('[api] Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// --- Server start -----------------------------------------------------------
const port = env.API_PORT;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 @done-swiping/api listening on http://localhost:${info.port}`);
  console.log('   GET  /health');
  console.log(`   POST ${API_ROUTES.sessionStart}`);
  console.log(`   POST ${API_ROUTES.idvWebhook}`);
  console.log(`   POST ${API_ROUTES.stripeWebhook}`);
  console.log(`   GET  ${API_ROUTES.memory}`);
  console.log(`   PUT  /memory/:id`);
  console.log(`   DELETE /memory/:id`);
  console.log(`   GET  ${API_ROUTES.memoryExport}`);
  console.log(`   GET  ${API_ROUTES.matches}`);
  console.log(`   POST ${API_ROUTES.report}`);
  console.log(`   POST ${API_ROUTES.block}`);
});

export default app;
