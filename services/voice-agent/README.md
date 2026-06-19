# Done Swiping — Voice Agent

LiveKit Agents service powering the Done Swiping voice conversation loop.

## Pipeline

```
User mic
  │
  ▼
Deepgram Flux STT (nova-3, en-GB)
  │  (transcribed text)
  ├──────────────────────────────────► Claude Haiku safety classifier
  │                                        │ (parallel, non-blocking)
  │                                        ▼
  │                                   safety_flags table (if flagged)
  │
  ▼
Claude Sonnet 4.6 (brain / companion LLM)
  │  (system: prompts/companion.md)
  │
  ▼
Cartesia TTS
  │
  ▼
User speaker  (barge-in / interruption enabled via Silero VAD)

On disconnect:
  conversations.ended_at set → extraction/worker.py triggered
  worker calls Claude Haiku (→ Sonnet escalation) with prompts/extraction.md
  → profile_attributes + inferred_traits + embeddings written to Supabase
```

## Dev commands

```bash
# From services/voice-agent/
uv sync                          # install dependencies
uv run python agent.py dev       # local dev (LiveKit dev server, hot-reload)
uv run python agent.py start     # production worker

# Run extraction manually for a conversation:
uv run python -m extraction.worker <conversation_id>
```

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
| `DEEPGRAM_API_KEY` | Deepgram API key (STT) |
| `ANTHROPIC_API_KEY` | Anthropic API key (brain + safety + extraction) |
| `BRAIN_MODEL` | Brain model string (default: `claude-sonnet-4-6`) |
| `WORKER_MODEL` | Worker/safety model (default: `claude-haiku-4-5-20251001`) |
| `CARTESIA_API_KEY` | Cartesia TTS API key |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API key (fallback) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (bypasses RLS) |
| `EMBEDDINGS_API_KEY` | Embeddings provider API key |
| `EMBEDDINGS_MODEL` | Embeddings model (default: `text-embedding-3-small`) |

## Compliance notes

### AI disclosure (EU AI Act Art. 50)
The agent speaks the AI disclosure opening line from `prompts/companion.md`
immediately at session start (`allow_interruptions=False`).  A reminder is
spoken periodically during long sessions (default: every 10 minutes).  The
companion never claims to be human.

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

### livekit-agents API
The exact class names, event hooks, and plugin constructor signatures in
`agent.py` were written against livekit-agents >=0.12.  The API has shifted
frequently between minor versions.  Before M2, run:

```bash
uv run python -c "import livekit.agents; print(livekit.agents.__version__)"
```

and review the changelog.  All uncertain call sites are marked
`# TODO(M2): confirm against installed livekit-agents API`.

## Milestone map

| Milestone | Scope in this service |
|---|---|
| M0 (now) | Skeleton, config, clients, compliance scaffolding |
| M2 | Wire live voice loop; confirm livekit-agents API calls |
| M3 | Production extraction pipeline; task queue; embedding batching |
| M5 | Safety queue, ops dashboard, async flag notifications |
