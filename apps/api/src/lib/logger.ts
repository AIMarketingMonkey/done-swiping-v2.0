/**
 * src/lib/logger.ts — tiny structured JSON logger + request-logging middleware.
 *
 * Outputs one JSON object per line to stdout so log aggregators (Fly.io / Render
 * log drains, Datadog, etc.) can parse them without additional configuration.
 *
 * Log levels: debug < info < warn < error
 *
 * Rules:
 *  - Never log PII (user email, names, phone numbers, transcript content).
 *  - Never log secrets (API keys, auth tokens, webhook secrets).
 *  - Structured `fields` must be plain, safe metadata only.
 *
 * Usage:
 *   import { logger } from './logger.js';
 *   logger.info('session started', { userId: 'uuid', room: 'onboarding-uuid' });
 *   logger.error('DB error', { route: '/consent', errMessage: err.message });
 *
 * Request middleware (requestLogger) is a Hono MiddlewareHandler that logs
 * method, path (not query string — may contain tokens), status, duration, and
 * a per-request ID.
 */

import type { MiddlewareHandler } from 'hono';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  msg: string;
  /** Caller-supplied safe, non-PII key-value pairs. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Core emit function
// ---------------------------------------------------------------------------

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  // JSON.stringify is synchronous and safe; stderr could be used for errors but
  // stdout is preferred so log drains receive a single ordered stream.
  process.stdout.write(JSON.stringify(entry) + '\n');
}

// ---------------------------------------------------------------------------
// Exported logger object
// ---------------------------------------------------------------------------

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};

// ---------------------------------------------------------------------------
// Request-logging middleware
// ---------------------------------------------------------------------------

/**
 * Hono middleware that logs one structured line per request.
 *
 * Logged fields:
 *   requestId — random hex identifier (for log correlation, not user tracking)
 *   method    — HTTP verb
 *   path      — matched route path pattern (NOT the raw URL — avoids leaking
 *               query-string tokens)
 *   status    — HTTP response status code
 *   durationMs — request duration in milliseconds
 */
export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  // 8 random bytes → 16 hex chars, enough for log correlation without UUID overhead.
  const requestId =
    Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);

  // Attach requestId to context variables so downstream handlers can reference it.
  c.set('requestId' as never, requestId);

  await next();

  const durationMs = Date.now() - start;
  const status = c.res.status;

  // Use routePath (the registered pattern) to avoid logging dynamic segments
  // (e.g. /memory/:id) that could contain user-controlled values.
  const path = c.req.routePath ?? c.req.path;

  const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

  emit(level, 'request', {
    requestId,
    method: c.req.method,
    path,
    status,
    durationMs,
  });
};
