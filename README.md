# Done Swiping

> Voice-first AI dating app. UK-first, regulated from day one.

Users are tired of endless swiping, shallow profiles and dating-app fatigue.
Done Swiping replaces the swipe with a warm, emotionally intelligent **AI dating
companion** that talks to people, understands who they are and what they want,
and builds a richer match profile than a form ever could — then matches them
deterministically and explainably.

The companion is **always clearly disclosed as AI**, is **never a therapist**,
and never sets your deal-breakers for you. Age assurance, consent, memory
review/export/delete and per-turn moderation are built in from day one.

## Monorepo layout

| Path | What it is | Stack |
| --- | --- | --- |
| `apps/mobile` | The app (and web demo build) | Expo / React Native, expo-router |
| `apps/api` | Backend-for-frontend / webhooks | Hono (TypeScript) |
| `services/voice-agent` | Real-time voice loop + extraction worker | LiveKit Agents (Python) |
| `packages/shared` | Shared types, zod schemas, constants | TypeScript |
| `supabase` | Postgres schema, RLS, edge functions | SQL |
| `infra` | Deploy config (Fly.io/Render) + CI | — |

## Quick start

```bash
# 1. Install JS/TS deps
pnpm install

# 2. Copy env and fill in keys (see docs/SETUP.md)
cp .env.example .env

# 3. Start Supabase locally (requires the Supabase CLI)
supabase start
supabase migration up

# 4. Run everything (turbo)
pnpm dev

# 5. Voice agent (separate, Python / uv)
cd services/voice-agent && uv sync && uv run python agent.py dev
```

## Documentation

- **`CLAUDE.md`** — project context + non-negotiable compliance rules.
- **`docs/RUNBOOK.md`** — run the whole app locally, end-to-end (start here to test).
- **`docs/DEPLOY.md`** — deploy everything to the cloud (Render) from this repo.
- **`docs/BUILD_PLAN.md`** — milestones M0–M7 with acceptance criteria.
- **`docs/SETUP.md`** — step-by-step external service / API-key setup guide.
- **`docs/ARCHITECTURE.md`** — system architecture and API contracts.
- **`docs/DECISIONS.md`** — key product/architecture decisions.
- **`docs/HARDENING.md`** — pre-public-beta checklist.

## Status

**MVP scaffold complete — M0–M7 all built** (code-complete + static-verified:
typecheck, lint, Prettier, ruff). M0/M1 are verified live against Supabase;
M2–M7 await a live end-to-end test on a dev build with the voice/Stripe keys.
See `docs/BUILD_PLAN.md` for the milestone detail, `docs/DECISIONS.md` for key
decisions, and `docs/HARDENING.md` for the pre-public-beta checklist.

| Milestone | What | State |
| --- | --- | --- |
| M0 | Monorepo, schema + RLS, shared, CI | ✅ verified |
| M1 | Auth, age-gate, consent | ✅ verified (dev-mock gate) |
| M2 | Voice loop (LiveKit/Deepgram/Claude/TTS A/B) | ✅ built |
| M3 | Transcript, memory, extraction | ✅ built |
| M4 | Deterministic matching | ✅ built |
| M5 | Safety: report/block, queue, staff console | ✅ built |
| M6 | Stripe payments + entitlement | ✅ built |
| M7 | Hardening: Sentry, rate limit, logging | ✅ built |

## Compliance (non-negotiable)

AI disclosure · age assurance before access · explicit consent for
special-category data · memory review/edit/delete/export · per-turn moderation +
report/block + review queue · UK/EU data region · no long-term raw audio ·
audit log on every privileged action. Details in `CLAUDE.md`.
