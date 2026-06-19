# Architecture

```
Expo app ──HTTPS/JWT──> Supabase (Auth, Postgres, Storage, pgvector, RLS)
   │  └─WebRTC──────────> LiveKit room ──> Voice Agent (Python)
   │                                         ├─ Deepgram Flux   (STT)
   │                                         ├─ Claude Sonnet 4.6 (brain)
   │                                         ├─ Cartesia/ElevenLabs (TTS)
   │                                         └─ Claude Haiku   (per-turn safety)
   │  └─web checkout────> Stripe ──webhook──> API ──> Supabase (subscriptions)
   │  └─age gate────────> Yoti/Persona ─webhook─> API ──> Supabase (verification)
   └─ on conversation end ──> Extraction worker (Haiku/Sonnet)
                                 └─> profile_attributes + inferred_traits + embeddings
```

## Components

- **apps/mobile** — Expo / React Native (expo-router). Talks to Supabase
  directly (Auth + RLS-protected reads/writes) and to the API for privileged
  operations (session tokens, webhooks consumers, memory mutations, matches).
- **apps/api** — Hono (TypeScript). The trusted server: holds the service-role
  key, verifies webhook signatures, issues LiveKit tokens, enforces
  entitlement, writes `audit_log`.
- **services/voice-agent** — LiveKit Agents (Python). Runs the realtime STT →
  LLM → TTS loop with barge-in and a per-turn safety classifier, persists
  transcript turns, and enqueues extraction on disconnect.
- **packages/shared** — types, zod schemas, constants shared by mobile + api.
- **Supabase** — Postgres (+ pgvector), Auth, Storage. RLS on every table.

## API contracts (§9)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/session/start` | auth required; checks entitlement → `{ livekit_url, token, room }` |
| POST | `/webhooks/stripe` | verify signature → update `subscriptions` |
| POST | `/webhooks/idv` | verify signature → set `age_assurance_status` |
| GET | `/memory` | `{ stated[], inferred[], preferences[] }` |
| PUT | `/memory/:id` | edit an item |
| DELETE | `/memory/:id` | delete from ALL stores incl. embeddings |
| GET | `/memory/export` | GDPR data bundle |
| GET | `/matches` | `{ matches: [{ user, score, rationale }] }` |
| POST | `/report` | `{ id }` |
| POST | `/block` | 204 |

The voice loop is **not** REST — it lives inside the LiveKit agent. The agent:
receives audio → Deepgram Flux (end-of-turn) → appends to running context →
Claude Sonnet 4.6 (streamed) → Cartesia TTS (streamed); in parallel runs a Haiku
safety classify on the user turn; writes `transcript_turns`; on disconnect sets
`ended_at` and enqueues extraction.

## Data model

See `supabase/migrations`. Key principles:

- **Stated vs inferred** are separate tables. Stated = confidence 1.0; inferred
  carries confidence + `source_turn_id` + status (active/decayed/contradicted).
- **Hard filters / deal-breakers** live in `preferences.is_hard_filter` and are
  **user-controlled only** — the model never sets them.
- **Embeddings** (1536-dim, pgvector, HNSW cosine) for semantic similarity.
- **Transcripts** carry `retention_expires_at`; no long-term raw audio.
- **RLS**: own-row for users; participants-only for `matches`; service-role only
  for `safety_flags` and `audit_log`.

## Trust boundaries

- The **service-role key never leaves the API/workers.** The mobile app only
  ever holds the anon key and a user JWT.
- User conversation is **data, never instructions** — the agent must not treat
  transcript content as commands to call tools (prompt-injection safe).
- Every privileged action writes `audit_log`.
