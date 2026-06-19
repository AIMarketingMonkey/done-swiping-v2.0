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
| `pnpm test:rls` | Prove RLS row-isolation (requires Supabase creds) |

## Environment variables

Copy `.env.example` in the repo root and fill in the values. The API reads from
the repo-root `.env` so a single file serves all workspaces.

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | Yes | Project REST URL |
| `SUPABASE_ANON_KEY` | Yes | Public anon key (also needed for `test:rls`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Secret — server only** |
| `ANTHROPIC_API_KEY` | M2+ | Voice agent |
| `LIVEKIT_URL` | M0+ | Session start endpoint |
| `LIVEKIT_API_KEY` | M0+ | Token issuance |
| `LIVEKIT_API_SECRET` | M0+ | Token signing |
| `IDV_WEBHOOK_SECRET` | M1 (prod) | HMAC-SHA256 secret for Yoti webhook signature |
| `IDV_SDK_ID` | M1 (prod) | Yoti SDK / application ID |
| `IDV_PEM` | M1 (prod) | Yoti partner private key (PEM string or file path) |
| `IDV_DEV_MODE` | No | Set `true`/`1` to enable dev-mock IDV path (never in prod) |
| `STRIPE_SECRET_KEY` | M6 | Payments |
| `STRIPE_WEBHOOK_SECRET` | M6 | Webhook signature |
| `API_PORT` | No | Defaults to 8787 |

## Route table

| Method | Path | Status | Auth | Notes |
|---|---|---|---|---|
| GET | `/health` | M0 | No | Liveness probe |
| POST | `/session/start` | M1 | JWT | Age-gate enforced; issues LiveKit token; entitlement TODO(M6) |
| POST | `/idv/session` | M1 | JWT | Creates Yoti IDV session; returns SDK token (or dev-mock URL) |
| POST | `/idv/dev/complete` | M1 — **dev only** | JWT | Simulates IDV result; **only mounted when `IDV_DEV_MODE=true`** |
| POST | `/consent` | M1 | JWT | Records consent choices; upserts into `consents` table |
| POST | `/webhooks/idv` | M1 | HMAC-SHA256 sig | Receives Yoti outcome; updates `profiles.age_assurance_status` |
| POST | `/webhooks/stripe` | Stub | Stripe sig | TODO(M6) subscription upsert |
| GET | `/memory` | Stub | JWT | TODO(M3) real queries |
| PUT | `/memory/:id` | Stub | JWT | TODO(M3) |
| DELETE | `/memory/:id` | Stub | JWT | TODO(M3) incl. embeddings |
| GET | `/memory/export` | Stub | JWT | TODO(M3) GDPR bundle |
| GET | `/matches` | Stub | JWT | TODO(M4) |
| POST | `/report` | Stub | JWT | TODO(M5) |
| POST | `/block` | Stub | JWT | TODO(M5) |

## Milestone M1 — Auth, Age-Gate & Consent

M1 adds the identity-verification and consent flows required by the UK Online
Safety Act and EU AI Act before a user can start a voice session.

**Dev-mock flow (no Yoti account needed):**

1. Add `IDV_DEV_MODE=true` to your `.env`.
2. `POST /idv/session` (Bearer JWT) → returns `{ session_id: "dev-<uuid>", url: "http://localhost:8787/idv/dev/complete?session=<id>" }`.
3. `POST /idv/dev/complete` (Bearer JWT, body `{ "status": "pass" }`) → sets your `profiles.age_assurance_status = 'pass'`.
4. `POST /consent` (Bearer JWT, body matching `consentSubmitSchema`) → records consents.
5. `POST /session/start` (Bearer JWT) → now succeeds (age-gate passed).

**RLS isolation test:**

```bash
# Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
pnpm --filter @done-swiping/api test:rls
```

The script creates two test users, verifies cross-user isolation on `profiles`
and `consents`, then deletes both users in a `finally` block.  CI without
Supabase secrets receives an exit-0 SKIPPED message.

## Security note — service-role key

`src/lib/supabase-admin.ts` uses the Supabase **service-role** key which
bypasses Row Level Security. This key:

- Must never be sent to the client (mobile app, browser).
- Must never appear in logs or error responses.
- Is used exclusively for privileged server operations: webhook updates, audit
  writes, and admin queries that legitimately cross RLS boundaries.

All privileged actions write to `audit_log` via `src/lib/audit.ts`.
