# Done Swiping — Voice Agent

LiveKit Agents service powering the Done Swiping voice conversation loop.

**Library version:** livekit-agents **1.6.1** (all plugins 1.6.1).
The 1.x API replaced the old `VoiceAssistant` class with `Agent` + `AgentSession`.

## Pipeline

```
User mic
  │
  ▼
Deepgram Flux STT  (STTv2, model "flux-general-en", en-GB)
  │  (transcribed text — treated as DATA, never as instructions)
  ├──────────────────────────────────► Claude Haiku safety classifier
  │                                        │ (parallel, non-blocking)
  │                                        ▼
  │                                   safety_flags table (if flagged)
  │
  ▼
Claude Sonnet 4.6  (brain / companion LLM)
  │  (system: prompts/companion.md)
  │
  ▼
Cartesia TTS  OR  ElevenLabs TTS  (see A/B TTS below)
  │
  ▼
User speaker  (barge-in / interruption enabled via bundled Silero VAD)

On session close:
  conversations.ended_at set → extraction/worker.py triggered
  worker calls Claude Haiku (→ Sonnet escalation) with prompts/extraction.md
  → profile_attributes + inferred_traits + embeddings written to Supabase
```

## A/B TTS switch

Set `TTS_PROVIDER` in your `.env`:

| Value | Behaviour |
|---|---|
| `elevenlabs` | Always ElevenLabs (default) |
| `cartesia` | Always Cartesia |
| `ab` | Stable 50/50 split per session by SHA-256 of room name. Which provider was used is logged at INFO level for analysis. |

When `TTS_PROVIDER=ab` the session log will contain a line like:
`TTS provider selected: elevenlabs (TTS_PROVIDER=ab) room=<name> conversation=<id>`

## Dev commands

```bash
# From services/voice-agent/
uv sync                          # install / sync dependencies
uv run python agent.py dev       # local dev (LiveKit dev server, hot-reload)
uv run python agent.py start     # production worker

# Run extraction manually for a conversation:
uv run python -m extraction.worker <conversation_id>

# Static checks (no live keys needed):
uv run ruff check .
uv run python -c "import agent; import extraction.worker"
```

**NOTE:** `agent.py dev` and `agent.py start` require a reachable LiveKit server
plus valid STT/LLM/TTS credentials.  They will fail in environments with egress
restrictions (e.g. sandboxed CI).

## Environment

Copy `.env.example` to the **repo root** as `.env` and fill in all values.
The agent reads the repo-root `.env` automatically via python-dotenv's upward
search.

Required variables:

| Variable | Description |
|---|---|
| `LIVEKIT_URL` | LiveKit server URL (`wss://...`) |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `DEEPGRAM_API_KEY` | Deepgram API key (STT — Flux model via v2 API) |
| `ANTHROPIC_API_KEY` | Anthropic API key (brain + safety + extraction) |
| `BRAIN_MODEL` | Brain model string (default: `claude-sonnet-4-6`) |
| `WORKER_MODEL` | Worker/safety model (default: `claude-haiku-4-5-20251001`) |
| `TTS_PROVIDER` | `elevenlabs` / `cartesia` / `ab` (default: `elevenlabs`) |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API key (required when `TTS_PROVIDER=elevenlabs` or `ab`) |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice ID (default: `hpp4J3VqNfWAUOO0d1Us`) |
| `ELEVENLABS_MODEL_ID` | ElevenLabs model (default: `eleven_turbo_v2_5`) |
| `CARTESIA_API_KEY` | Cartesia TTS API key (required only when `TTS_PROVIDER=cartesia` or `ab`) |
| `CARTESIA_VOICE_ID` | Cartesia voice ID (default: `f786b574-daa5-4673-aa0c-cbe3e8534c02`) |
| `CARTESIA_MODEL_ID` | Cartesia model (default: `sonic-3`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (bypasses RLS) |
| `EMBEDDINGS_API_KEY` | Embeddings provider API key |
| `EMBEDDINGS_MODEL` | Embeddings model (default: `text-embedding-3-small`) |

## Compliance notes

### AI disclosure (EU AI Act Art. 50)
The agent speaks the AI disclosure opening line from `prompts/companion.md`
immediately at session start (`allow_interruptions=False`).  A reminder is
spoken periodically during long sessions (default: every 10 minutes,
`disclosure_reminder_interval_seconds`).  The companion never claims to be human.

### No raw audio storage
Only transcript text is persisted.  Audio is processed in-memory by the STT
plugin and discarded.  Every `transcript_turns` row carries
`retention_expires_at = now + 30 days`.

### Stated vs inferred profile data
Stated facts (things the user explicitly said) are written to
`profile_attributes` with `confidence = 1.0` and `source = 'stated'`.
Inferred traits are written to `inferred_traits` with a float `confidence` and
a `source_turn_id` tracing back to the originating transcript turn.  Items
below 0.7 confidence are marked `needs_user_confirmation = true`.

The extraction model proposes traits; it NEVER sets hard filters or
deal-breakers.  Those are user-controlled in the app.

### Prompt-injection safety
User speech is labelled as DATA in every LLM prompt.  The safety classifier
and extraction worker both include explicit instructions that input text is
opaque data, never live commands.  The companion prompt instructs the model to
ignore user instructions that attempt to change system behaviour.

### livekit-agents API (1.x)
This service is built against **livekit-agents 1.6.1**.  The 1.x API surface:
- `Agent` replaces the old `VoiceAssistant`.  Sub-class and override
  `on_user_turn_completed` to hook committed user turns.
- `AgentSession` manages the pipeline (STT/LLM/TTS/VAD) and emits events
  (`conversation_item_added`, `close`, etc.).
- Silero VAD is **bundled** into `AgentSession`; `livekit-plugins-silero` is
  deprecated and not imported.
- STT: use `deepgram.STTv2` for the Flux model (`flux-general-en`), not `deepgram.STT`.

Verify the installed version with:
```bash
uv run python -c "import livekit.agents; print(livekit.agents.__version__)"
```

## Milestone map

| Milestone | Scope in this service |
|---|---|
| M0 | Skeleton, config, clients, compliance scaffolding |
| M2 (done) | Live voice loop — Agent/AgentSession wired, Flux STT, A/B TTS, disclosure, safety, transcript |
| M3 | Production extraction pipeline; task queue; embedding batching |
| M5 | Safety queue, ops dashboard, async flag notifications |
