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
- **`docs/BUILD_PLAN.md`** — milestones M0–M7 with acceptance criteria.
- **`docs/SETUP.md`** — step-by-step external service / API-key setup guide.
- **`docs/ARCHITECTURE.md`** — system architecture and API contracts.

## Status

🚧 **M0 — Foundations** (scaffold). See `docs/BUILD_PLAN.md` for what's next.

## Compliance (non-negotiable)

AI disclosure · age assurance before access · explicit consent for
special-category data · memory review/edit/delete/export · per-turn moderation +
report/block + review queue · UK/EU data region · no long-term raw audio ·
audit log on every privileged action. Details in `CLAUDE.md`.
