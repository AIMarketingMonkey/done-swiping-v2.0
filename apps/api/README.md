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
| `STRIPE_PUBLISHABLE_KEY` | M6 | Sent to the client (safe) |
| `STRIPE_WEBHOOK_SECRET` | M6 | Webhook signature |
| `STRIPE_PRICE_PREMIUM` | M6 | Stripe Price ID for the premium plan (e.g. `price_xxx`) |
| `API_PUBLIC_URL` | M6 | Public HTTPS base URL of this service — used as Stripe return URL |
| `APP_DEEP_LINK` | No | Deep-link scheme for the mobile app (default `doneswiping://`) |
| `API_PORT` | No | Defaults to 8787 |

## Route table

| Method | Path | Status | Auth | Notes |
|---|---|---|---|---|
| GET | `/health` | M0 | No | Liveness probe |
| POST | `/session/start` | M6 | JWT | Age-gate + entitlement gate; issues LiveKit token (402 if free tier exhausted) |
| POST | `/idv/session` | M1 | JWT | Creates Yoti IDV session; returns SDK token (or dev-mock URL) |
| POST | `/idv/dev/complete` | M1 — **dev only** | JWT | Simulates IDV result; **only mounted when `IDV_DEV_MODE=true`** |
| POST | `/consent` | M1 | JWT | Records consent choices; upserts into `consents` table |
| POST | `/webhooks/idv` | M1 | HMAC-SHA256 sig | Receives Yoti outcome; updates `profiles.age_assurance_status` |
| POST | `/webhooks/stripe` | M6 | Stripe sig | Upserts `subscriptions` on checkout/sub events |
| POST | `/billing/checkout` | M6 | JWT | Create Stripe Checkout Session; returns `{ url }` |
| GET  | `/billing/return` | M6 | No | Web→app bridge: redirects to `APP_DEEP_LINK/paywall?status=` |
| POST | `/billing/portal` | M6 | JWT | Create Stripe Billing Portal session; returns `{ url }` |
| GET  | `/me/entitlement` | M6 | JWT | Returns `{ premium, tier, status, current_period_end }` |
| GET | `/memory` | M3 | JWT | Returns stated facts, inferred traits, preferences |
| PUT | `/memory/:id` | M3 | JWT | Update a memory item; body must include `kind` |
| DELETE | `/memory/:id?kind=` | M3 | JWT | Delete item + purge user embeddings (GDPR) |
| GET | `/memory/export` | M3 | JWT | GDPR Art. 20 data-portability bundle |
| GET | `/matches` | M4 | JWT | Deterministic matching; recomputes and refreshes suggestions each call |
| POST | `/report` | M5 | JWT | Submit a safety report against another user |
| POST | `/block` | M5 | JWT | Block another user; idempotent (upsert) |
| GET | `/admin/flags` | M5 | JWT + staff | List safety flags; `?status=open` (default) |
| POST | `/admin/flags/:id` | M5 | JWT + staff | Update flag status; body: `moderationActionSchema` |
| GET | `/admin/reports` | M5 | JWT + staff | List user reports; `?status=open` (default) |
| POST | `/admin/reports/:id` | M5 | JWT + staff | Update report status; body: `moderationActionSchema` |

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

## Milestone M3 — Memory API

M3 implements the four memory endpoints backed by three DB tables:
`profile_attributes` (stated facts), `inferred_traits`, and `preferences`.

### Endpoint details

**GET /memory**
Queries all three tables scoped to the authenticated user and returns a
response validated against `memoryResponseSchema` from `@done-swiping/shared`.

**PUT /memory/:id**
Body must match `memoryUpdateSchema` (requires `kind: 'stated'|'inferred'|'preference'`).
Allowed field updates per kind:
- `stated` → `value`
- `inferred` → `trait_value` and/or `status`
- `preference` → `value` and/or `is_hard_filter`

The AI model never sets `is_hard_filter`; only explicit user actions reach this
endpoint so toggling it here is correct and safe.  Returns the updated row or
404 if the item is not found / not owned by the caller.  Writes an audit entry
(`action: 'memory.update'`).

**DELETE /memory/:id?kind=stated|inferred|preference**
Deletes the item from the appropriate table, then **purges all of the user's
rows in the `embeddings` table**.  Embeddings are derived from the full profile;
after any deletion it is impossible to isolate which vectors encoded the removed
fact, so the correct GDPR approach is to purge all of the user's vectors.  The
extraction pipeline regenerates them from the remaining (post-deletion) data on
the next scheduled run.  Returns 204.  Writes an audit entry (`action:
'memory.delete'`) including `embeddings_purged` flag.

**GET /memory/export**
Assembles a GDPR Art. 20 data-portability bundle containing: `profiles` row,
`profile_attributes[]`, `inferred_traits[]`, `preferences[]`, `consents[]`, and
`conversations[]` (id, started_at, ended_at, summary only — raw transcript turns
and vectors are excluded by design).  Sets
`Content-Disposition: attachment; filename="done-swiping-export.json"`.  Writes
an audit entry (`action: 'memory.export'`).

## Milestone M4 — Deterministic Matching

M4 implements `GET /matches` with a fully deterministic pipeline — no LLM
re-ranking at MVP. Results are stored in the `matches` table and returned as
`matchesResponseSchema`.

### Migration required

Before deploying M4, apply the new migration to your Supabase project:

```bash
supabase migration up
# or, for the hosted project:
supabase db push
```

**Migration file:** `supabase/migrations/20260619120000_m4_matching.sql`

This creates the `match_candidates(p_user uuid)` Postgres function (SECURITY
DEFINER, `search_path = public, extensions`) and grants EXECUTE to the
`authenticated` role.

### Matching pipeline

**Stage 1 — Hard filters (SQL, inside `match_candidates()`)**
Candidates violating any of the authenticated user's hard-filter preferences
(`is_hard_filter = true` OR `type = 'dealbreaker'`) are excluded. Five profile
columns are evaluated in SQL: `gender`, `age_band`, `orientation`,
`location_region`, `relationship_intent`. Unknown preference keys are skipped
in SQL and may be evaluated in future TS extensions.

**Stage 2 — Compatibility score (TypeScript)**
A deterministic weighted blend:

| Signal | Weight |
|---|---|
| Cosine similarity of `summary` embeddings (pgvector `<=>`) | 0.60 |
| `profile_attributes` key/value overlap | 0.25 |
| Active `inferred_traits` key/value overlap | 0.15 |

Overlap = `matched_keys / max(user_count, candidate_count, 1)`.
Final score is clamped to `[0, 1]` and rounded to 3 d.p.

**Stage 3 — Rationale**
A plain-English sentence assembled from shared relationship intent, overlapping
attributes, and traits. No LLM. Example:
> "You both want something long-term and share interests in hiking and live music."

**Stage 4 — Safety gate (SQL, inside `match_candidates()`)**
Candidates are excluded if: `age_assurance_status != 'pass'`; active block in
either direction; open `safety_flags` row. This gate cannot be bypassed by any
client input.

### Data flow

1. `match_candidates(userId)` RPC → up to 50 candidates with cosine similarity.
2. Batch-fetch `profile_attributes` + active `inferred_traits` for user + all candidates.
3. Compute weighted score and build rationale per candidate.
4. Delete prior `status='suggested'` rows for the user in `matches`.
5. Insert new rows; return via `matchesResponseSchema`.
6. Write `audit_log` (`action: 'matches.compute'`).

### Trust boundary

The service-role Supabase client is used for all queries. The authenticated
`userId` is always sourced from the verified JWT (via `requireAuth` middleware),
never from client-supplied request data. `p_user` passed to the RPC equals the
JWT-verified user ID.

## Milestone M5 — Safety & Moderation

M5 implements the user-facing report/block endpoints and the staff-gated
moderation console.

### Migration required

Before deploying M5, apply the new migration:

```bash
supabase migration up
# or, for the hosted project:
supabase db push
```

**Migration file:** `supabase/migrations/20260620120001_m5_staff.sql`

Adds `profiles.is_staff boolean not null default false`. This column is set
only via service-role or direct SQL — it can never be self-promoted through
the API.

### Report and block

**POST /report**
Authenticated users submit a safety report against another user.
Body: `{ reported: uuid, reason: string (1–1000 chars) }`.
Self-reporting (reporter === reported) is rejected with 400.
Inserts a row into `reports` with `status='open'` and returns `{ id }`.
Writes an `audit_log` entry (`action: 'safety.report_submitted'`).

**POST /block**
Authenticated users block another user. Idempotent — duplicate blocks are
silently ignored (upsert with `ignoreDuplicates`).
Body: `{ blocked: uuid }`. Self-blocking rejected with 400.
Returns 204. Writes `audit_log` (`action: 'safety.block_applied'`).

### Admin / moderation console (staff-gated)

All `/admin/*` routes require a valid JWT (`requireAuth`) AND the authed
user's `profiles.is_staff = true` (`requireStaff`). Non-staff requests
receive `403 { error: 'staff_only' }`.

`requireStaff` is implemented in `src/lib/staff.ts`. It uses the service-role
client to read `profiles.is_staff` after `requireAuth` has set `c.var.userId`.

**GET /admin/flags?status=open**
Returns `safety_flags` rows ordered by `created_at` desc.
Response validated against `safetyFlagsResponseSchema`.

**POST /admin/flags/:id**
Body: `moderationActionSchema` (`{ status: 'reviewing'|'actioned'|'dismissed', note? }`).
Updates `status` and sets `reviewed_by` to the staff user's id.
Returns 404 if the flag does not exist.
Writes `audit_log` (`action: 'admin.flag.action'`).

**GET /admin/reports?status=open**
Returns `reports` rows ordered by `created_at` desc.
Response validated against `reportsResponseSchema`.

**POST /admin/reports/:id**
Body: `moderationActionSchema`.
Updates the report `status`. Returns 404 if not found.
Writes `audit_log` (`action: 'admin.report.action'`).

## Milestone M7 — Hardening / Observability

### Sentry error capture

`src/lib/observability.ts` initialises `@sentry/node` once at startup (call
`initSentry()` before any route handling).  When `SENTRY_DSN` is **not** set
the module is a complete no-op — no import errors, no startup failures.

The global `onError` handler in `src/index.ts` calls `captureError(err, context)`
after logging via `logger.error`.  Internally sensitive data (request bodies,
auth tokens, user content) is never attached to Sentry events — `sendDefaultPii`
is `false` and `defaultIntegrations` is `false` to suppress automatic request
body capture.

| Env var | Required | Notes |
|---|---|---|
| `SENTRY_DSN` | No | If unset, Sentry is disabled |

### Structured logging

`src/lib/logger.ts` emits one JSON line per event to stdout:
```json
{"timestamp":"…","level":"info","msg":"request","requestId":"a1b2c3d4e5f6g7h8","method":"POST","path":"/session/start","status":200,"durationMs":42}
```

The `requestLogger` middleware (mounted first in `src/index.ts`) logs every
request with method, **matched route pattern** (not raw URL), status, duration,
and a per-request correlation ID.  Query strings are deliberately excluded to
avoid leaking any tokens that appear there.

### Rate limiting

`src/lib/rate-limit.ts` provides a `rateLimit({ windowMs, max })` Hono
middleware factory.  Applied limits (30 req/min per client IP × route):

| Route | Limit |
|---|---|
| `POST /session/start` | 30/min |
| `POST /idv/session` | 30/min |
| `POST /consent` | 30/min |
| `POST /report` | 30/min |
| `POST /block` | 30/min |
| `POST /billing/checkout` | 30/min |

`/webhooks/*` routes are intentionally **not** rate-limited — Stripe and IDV
providers retry delivery; signature verification is the defence there.

**Important:** the in-memory limiter is per-process only.
`TODO(scale)`: swap the `Map` store for Redis / Upstash before multi-instance
horizontal scaling.

### Analytics

`src/lib/analytics.ts` exports `track(event, userId?, props?)`.  Events are
currently emitted as structured `analytics` JSON lines to stdout.
`TODO`: forward to a real sink (Amplitude / PostHog / custom Supabase events
table) before launch.

Key events tracked:

| Event | Where |
|---|---|
| `session.start` | `routes/session.ts` |
| `consent.recorded` | `routes/consent.ts` |
| `match.computed` | `routes/matches.ts` |
| `checkout.started` | `routes/billing.ts` |
| `subscription.activated` | `routes/stripe-webhook.ts` |

No PII is included in analytics props — only structural metadata (counts, UUIDs,
plan status booleans).

### Audit coverage (M7 verification)

All privileged mutations already call `writeAudit` from `src/lib/audit.ts`:

| Route / handler | Audit action |
|---|---|
| `POST /session/start` | `session.start` |
| `POST /idv/session` | `idv.session.start` |
| `POST /webhooks/idv` | `idv.webhook` |
| `POST /consent` | `consent.record` |
| `POST /report` | `safety.report_submitted` |
| `POST /block` | `safety.block_applied` |
| `GET /matches` | `matches.compute` |
| `GET /memory/export` | `memory.export` |
| `PUT /memory/:id` | `memory.update` |
| `DELETE /memory/:id` | `memory.delete` |
| `POST /billing/checkout` | `billing.checkout` |
| `POST /billing/portal` | `billing.portal` |
| `POST /webhooks/stripe` | `billing.webhook` |
| `POST /admin/flags/:id` | `admin.flag.action` |
| `POST /admin/reports/:id` | `admin.report.action` |

No missing audit calls were found during M7 review.

## Milestone M6 — Payments (Stripe)

M6 adds Stripe-powered subscription billing with a free-tier session cap and a
web→app return bridge (Stripe requires HTTPS success/cancel URLs).

### Stripe setup (one-time, in the Stripe dashboard)

1. Create a **Product** (e.g. "Done Swiping Premium") and a recurring **Price**
   (monthly or annual). Copy the `price_xxx` ID into `STRIPE_PRICE_PREMIUM`.
2. Create a **Webhook endpoint** pointing at `https://<your-domain>/webhooks/stripe`.
   Subscribe to: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Enable the **Customer Portal** in Stripe Dashboard → Billing → Customer Portal.
   Configure the features you want to expose (cancel, update payment method, etc.).

### Checkout → webhook → entitlement flow

```
Mobile app
  └─ POST /billing/checkout (JWT)
       └─ Ensure Stripe Customer (reuse or create, persist stripe_customer_id)
       └─ Create Checkout Session (mode: subscription, price, customer, metadata.user_id)
       └─ Return { url }
App opens url in in-app browser
  └─ User completes payment on Stripe-hosted page
       └─ Stripe redirects to /billing/return?status=success
            └─ HTML page redirects to doneswiping://paywall?status=success
Stripe fires webhook → POST /webhooks/stripe
  └─ Signature verified (constructEvent)
  └─ checkout.session.completed → retrieve subscription → upsert subscriptions row
  └─ customer.subscription.* → upsert tier/status/current_period_end
Mobile app polls GET /me/entitlement
  └─ premium=true once subscription is active/trialing
```

### Free-tier gate

`POST /session/start` counts the user's rows in `conversations`. If
`count >= FREE_VOICE_SESSION_LIMIT` (currently 3) and the user is not premium
(`subscriptions.status` not in `active|trialing`), the endpoint returns
**402 `{ error: 'premium_required' }`**. The mobile app should direct the user
to the paywall screen.

### Web→app return bridge (`GET /billing/return`)

Stripe requires HTTPS `success_url` and `cancel_url`. The bridge page is a tiny
HTML file that uses `<meta http-equiv="refresh">` to redirect immediately to
`APP_DEEP_LINK/paywall?status=<status>` and provides a tap-here fallback link.
`status` is sanitised to `success | cancel | portal | unknown` to prevent
open-redirect abuse.

### Billing Portal

`POST /billing/portal` (JWT) creates a Stripe-hosted portal session for the
user's existing `stripe_customer_id` (404 if none). The portal `return_url`
goes back through `/billing/return?status=portal` so the app can handle it
uniformly.

### Audit log actions

| Action | Trigger |
|---|---|
| `billing.checkout` | Checkout Session created |
| `billing.portal` | Portal session created |
| `billing.webhook` | Any handled Stripe webhook event |
