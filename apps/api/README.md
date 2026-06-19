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
| GET | `/memory` | M3 | JWT | Returns stated facts, inferred traits, preferences |
| PUT | `/memory/:id` | M3 | JWT | Update a memory item; body must include `kind` |
| DELETE | `/memory/:id?kind=` | M3 | JWT | Delete item + purge user embeddings (GDPR) |
| GET | `/memory/export` | M3 | JWT | GDPR Art. 20 data-portability bundle |
| GET | `/matches` | M4 | JWT | Deterministic matching; recomputes and refreshes suggestions each call |
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
