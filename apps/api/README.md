# @done-swiping/api

Hono (TypeScript / ESM) backend for Done Swiping. Runs on Node.js; deployed to
Fly.io / Render. Holds the Supabase **service-role** key, verifies webhook
signatures, issues LiveKit tokens, and enforces entitlement.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start with hot-reload via tsx watch |
| `pnpm build` | Compile TypeScript → dist/ |
| `pnpm start` | Run the compiled build |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm lint` | ESLint (flat config, typescript-eslint) |
| `pnpm smoke` | Validate external service credentials |

## Environment variables

Copy `.env.example` in the repo root and fill in the values. The API reads from
the repo-root `.env` so a single file serves all workspaces.

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | Yes | Project REST URL |
| `SUPABASE_ANON_KEY` | Yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Secret — server only** |
| `ANTHROPIC_API_KEY` | M2+ | Voice agent |
| `LIVEKIT_URL` | M0+ | Session start endpoint |
| `LIVEKIT_API_KEY` | M0+ | Token issuance |
| `LIVEKIT_API_SECRET` | M0+ | Token signing |
| `IDV_WEBHOOK_SECRET` | M1 | Shared secret for IDV provider |
| `STRIPE_SECRET_KEY` | M6 | Payments |
| `STRIPE_WEBHOOK_SECRET` | M6 | Webhook signature |
| `API_PORT` | No | Defaults to 8787 |

## Route table

| Method | Path | Status | Auth | Notes |
|---|---|---|---|---|
| GET | `/health` | Implemented | No | Liveness probe |
| POST | `/session/start` | Implemented (M0 skeleton) | JWT | Issues LiveKit token; entitlement TODO(M6) |
| POST | `/webhooks/idv` | Implemented (M1) | Shared secret | Updates age_assurance_status |
| POST | `/webhooks/stripe` | Stub | None (signature) | TODO(M6) subscription upsert |
| GET | `/memory` | Stub | JWT | TODO(M3) real queries |
| PUT | `/memory/:id` | Stub | JWT | TODO(M3) |
| DELETE | `/memory/:id` | Stub | JWT | TODO(M3) incl. embeddings |
| GET | `/memory/export` | Stub | JWT | TODO(M3) GDPR bundle |
| GET | `/matches` | Stub | JWT | TODO(M4) |
| POST | `/report` | Stub | JWT | TODO(M5) |
| POST | `/block` | Stub | JWT | TODO(M5) |

## Security note — service-role key

`src/lib/supabase-admin.ts` uses the Supabase **service-role** key which
bypasses Row Level Security. This key:

- Must never be sent to the client (mobile app, browser).
- Must never appear in logs or error responses.
- Is used exclusively for privileged server operations: webhook updates, audit
  writes, and admin queries that legitimately cross RLS boundaries.

All privileged actions write to `audit_log` via `src/lib/audit.ts`.
