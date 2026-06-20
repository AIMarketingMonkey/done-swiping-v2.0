"""
agent.py — Done Swiping voice agent entrypoint.

Built against livekit-agents 1.6.1 (and matching plugin versions 1.6.1).
The 1.x API replaced VoiceAssistant with Agent + AgentSession.

Pipeline:
  Deepgram Flux STT (STTv2, model "flux-general-en") → Claude Sonnet brain
  → Cartesia or ElevenLabs TTS (A/B via TTS_PROVIDER env), Silero VAD
  (bundled in AgentSession — no explicit import needed).

Compliance:
- AI disclosure spoken at session start (opening line from companion.md),
  allow_interruptions=False so user cannot accidentally skip it.
- Periodic disclosure reminder spoken every disclosure_reminder_interval_seconds.
- All user speech treated as DATA, never as instructions (prompt-injection safe).
- Only transcript text persisted — NO raw audio stored long-term.
- transcript_turns rows carry retention_expires_at (now + 30 days).
- On session close: conversations.ended_at set, extraction worker triggered.

A/B TTS:
  TTS_PROVIDER=cartesia   → always Cartesia (default)
  TTS_PROVIDER=elevenlabs → always ElevenLabs
  TTS_PROVIDER=ab         → stable random split per session (room-name hash),
                            which provider was chosen is logged for analysis.

Dev:   uv run python agent.py dev
Start: uv run python agent.py start

Live testing requires LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET plus the
STT/LLM/TTS keys.  See README.md for the full env-var table.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    CloseEvent,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.agents import llm as agents_llm
from livekit.plugins import anthropic as lk_anthropic
from livekit.plugins import cartesia as lk_cartesia
from livekit.plugins import deepgram as lk_deepgram
from livekit.plugins import elevenlabs as lk_elevenlabs

from lib.config import get_settings
from lib.safety import classify_turn, persist_flag
from lib.sentry import capture_exception, init_sentry
from lib.supabase_client import (
    close_conversation,
    insert_conversation,
    insert_transcript_turn,
)

logger = logging.getLogger(__name__)

# Strong references for fire-and-forget tasks (prevents premature GC, PEP 3156 / RUF006).
_background_tasks: set[asyncio.Task] = set()  # type: ignore[type-arg]


def _fire_and_forget(coro: object) -> asyncio.Task:  # type: ignore[type-arg]
    """Schedule a coroutine as a background task and keep a strong reference."""
    task = asyncio.ensure_future(coro)  # type: ignore[arg-type]
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


# ── Prompt loading ─────────────────────────────────────────────────────────────

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load_companion_prompt() -> str:
    """Load the companion system prompt from prompts/companion.md."""
    path = _PROMPTS_DIR / "companion.md"
    if not path.exists():
        raise FileNotFoundError(
            f"Companion prompt not found at {path}. "
            "This file must exist before running the agent."
        )
    return path.read_text(encoding="utf-8")


def _extract_disclosure_opening(prompt_text: str) -> str:
    """
    Extract the AI disclosure opening line from the companion prompt.

    companion.md specifies the opening line as text beginning with
    'Before we start —'.  Falls back to a hard-coded safe default so
    disclosure always fires even if the prompt file changes structure.
    """
    marker = "Before we start —"
    for line in prompt_text.splitlines():
        stripped = line.strip().strip("*").strip('"').strip("'")
        if stripped.startswith(marker):
            return stripped
    # Safe fallback — always disclose even if parsing fails.
    return (
        "Before we start — I'm an AI companion, not a human. "
        "I'm here to help you find better matches, and you can stop any time."
    )


# ── TTS provider selection ─────────────────────────────────────────────────────


def _build_tts(room_name: str) -> tuple[agents_llm.tts.TTS, str]:  # type: ignore[name-defined]
    """
    Return (tts_instance, provider_label) according to TTS_PROVIDER env var.

    TTS_PROVIDER=cartesia   → Cartesia always (default)
    TTS_PROVIDER=elevenlabs → ElevenLabs always
    TTS_PROVIDER=ab         → stable random split by room-name hash (50/50)
    """
    from livekit.agents import tts as agents_tts

    settings = get_settings()
    provider_env = settings.tts_provider.lower()

    if provider_env == "ab":
        # Stable split: rooms whose first hash byte is even use Cartesia.
        digest = hashlib.sha256(room_name.encode()).digest()
        use_cartesia = digest[0] % 2 == 0
        chosen = "cartesia" if use_cartesia else "elevenlabs"
    else:
        chosen = provider_env  # "cartesia" or "elevenlabs"

    if chosen == "cartesia":
        tts_instance: agents_tts.TTS = lk_cartesia.TTS(
            api_key=settings.cartesia_api_key,
            voice=settings.cartesia_voice_id,
            model=settings.cartesia_model_id,
        )
    else:
        tts_instance = lk_elevenlabs.TTS(
            api_key=settings.elevenlabs_api_key,
            voice_id=settings.elevenlabs_voice_id,
        )

    return tts_instance, chosen


# ── Session state ──────────────────────────────────────────────────────────────


class _SessionState:
    """Mutable state scoped to a single LiveKit room session."""

    def __init__(self, conversation_id: int, retention_expires_at: str) -> None:
        self.conversation_id = conversation_id
        self.retention_expires_at = retention_expires_at
        self.turn_index: int = 0
        self.last_user_turn_id: int | None = None
        self._lock = asyncio.Lock()

    async def next_turn_index(self) -> int:
        async with self._lock:
            idx = self.turn_index
            self.turn_index += 1
            return idx


# ── Turn persistence ───────────────────────────────────────────────────────────


async def _handle_user_turn(state: _SessionState, user_text: str) -> None:
    """
    Called on each finalised user speech turn.

    Fires safety classification in parallel (non-blocking for the reply),
    then persists the transcript turn to Supabase.
    User speech is treated as opaque DATA — never as model instructions.
    """
    turn_idx = await state.next_turn_index()

    # Fire safety classification without blocking the LLM reply.
    safety_task = asyncio.create_task(
        classify_turn(user_text),
        name=f"safety-{state.conversation_id}-{turn_idx}",
    )
    _background_tasks.add(safety_task)
    safety_task.add_done_callback(_background_tasks.discard)

    # Persist transcript turn (text only — no audio).
    try:
        row = await insert_transcript_turn(
            conversation_id=state.conversation_id,
            role="user",
            text=user_text,
            turn_index=turn_idx,
            retention_expires_at=state.retention_expires_at,
        )
        state.last_user_turn_id = row.get("id")
    except Exception as exc:
        logger.error("Failed to persist user turn %d: %s", turn_idx, exc)

    # Await safety result and persist flag if needed.
    try:
        safety_result = await safety_task
        if safety_result["flagged"]:
            await persist_flag(
                conversation_id=state.conversation_id,
                turn_id=state.last_user_turn_id,
                result=safety_result,
                user_text=user_text,
            )
    except Exception as exc:
        logger.error("Safety pipeline error (non-fatal): %s", exc)


async def _handle_assistant_turn(state: _SessionState, assistant_text: str) -> None:
    """Persist an assistant speech turn to the transcript."""
    turn_idx = await state.next_turn_index()
    try:
        await insert_transcript_turn(
            conversation_id=state.conversation_id,
            role="assistant",
            text=assistant_text,
            turn_index=turn_idx,
            retention_expires_at=state.retention_expires_at,
        )
    except Exception as exc:
        logger.error("Failed to persist assistant turn %d: %s", turn_idx, exc)


# ── Periodic disclosure reminder ───────────────────────────────────────────────


async def _periodic_disclosure(
    session: AgentSession,
    interval_seconds: int,
) -> None:
    """
    Periodically inject a brief AI disclosure reminder for long sessions.

    Complies with EU AI Act Art. 50 — disclose at first interaction AND again
    during long or emotionally heavy sessions.
    """
    reminder = (
        "Just a quick reminder — I'm an AI, not a human, "
        "and everything we talk about stays between you and the app."
    )
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await session.say(reminder, allow_interruptions=True)
            logger.info("Periodic AI disclosure reminder spoken.")
        except Exception as exc:
            logger.warning("Failed to speak disclosure reminder: %s", exc)


# ── Extraction trigger ─────────────────────────────────────────────────────────


async def _trigger_extraction(conversation_id: int) -> None:
    """
    Enqueue the extraction worker for a completed conversation.

    Runs in-process as a fire-and-forget task.
    TODO(M3): replace with a proper task queue (Supabase pg_notify / pgmq /
    external queue) so extraction runs out-of-band and survives agent restarts.
    """
    try:
        from extraction.worker import run_extraction

        _fire_and_forget(run_extraction(conversation_id))
        logger.info("Extraction task enqueued for conversation %d.", conversation_id)
    except Exception as exc:
        logger.error(
            "Failed to enqueue extraction for conversation %d: %s",
            conversation_id,
            exc,
        )


# ── Companion agent ────────────────────────────────────────────────────────────


class CompanionAgent(Agent):
    """
    Done Swiping companion agent.

    Subclasses Agent so we can override on_user_turn_completed to hook into
    the committed-turn event without importing private internals.
    """

    def __init__(
        self,
        instructions: str,
        state: _SessionState,
        session: AgentSession,
        **kwargs: object,
    ) -> None:
        super().__init__(instructions=instructions, **kwargs)  # type: ignore[arg-type]
        self._state = state
        self._session = session

    async def on_user_turn_completed(
        self,
        turn_ctx: agents_llm.ChatContext,
        new_message: agents_llm.ChatMessage,
    ) -> None:
        """
        Called by the framework when the user finishes speaking and the turn
        is committed to the chat context, before the LLM generates a reply.

        User speech is treated as opaque DATA — never as model instructions.
        Safety classification and transcript persistence fire here in background.
        """
        text = new_message.text_content or ""
        if text:
            _fire_and_forget(_handle_user_turn(self._state, text))


# ── Main entrypoint ────────────────────────────────────────────────────────────


async def entrypoint(ctx: JobContext) -> None:
    """
    LiveKit Agents entrypoint — called once per room/job.

    Wires up the voice pipeline and manages session lifecycle.
    """
    settings = get_settings()
    logger.info(
        "Voice agent starting: room=%s brain=%s worker=%s",
        ctx.room.name,
        settings.brain_model,
        settings.worker_model,
    )

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Resolve user_id from participant identity set by the token-generation API.
    participant = await ctx.wait_for_participant()
    user_id: str = participant.identity or "unknown"

    # ── Supabase conversation row ──────────────────────────────────────────────
    retention_expires_at = (
        datetime.now(UTC) + timedelta(days=settings.transcript_retention_days)
    ).isoformat()

    conversation_row = await insert_conversation(
        user_id=user_id,
        room_name=ctx.room.name,
        retention_days=settings.transcript_retention_days,
    )
    conversation_id: int = conversation_row["id"]
    state = _SessionState(
        conversation_id=conversation_id,
        retention_expires_at=retention_expires_at,
    )

    # ── Load companion system prompt ───────────────────────────────────────────
    companion_prompt = _load_companion_prompt()
    disclosure_opening = _extract_disclosure_opening(companion_prompt)

    # ── Select TTS provider (A/B or fixed) ────────────────────────────────────
    tts_instance, tts_provider_used = _build_tts(ctx.room.name)
    logger.info(
        "TTS provider selected: %s (TTS_PROVIDER=%s) room=%s conversation=%d",
        tts_provider_used,
        settings.tts_provider,
        ctx.room.name,
        conversation_id,
    )

    # ── Build STT: Deepgram Flux via STTv2 ────────────────────────────────────
    # STTv2 targets the Deepgram v2 Flux API (websocket endpoint).
    # Default model is "flux-general-en"; multi-language: "flux-general-multi".
    stt = lk_deepgram.STTv2(
        api_key=settings.deepgram_api_key,
        model="flux-general-en",
    )

    # ── Build LLM ─────────────────────────────────────────────────────────────
    llm = lk_anthropic.LLM(
        model=settings.brain_model,
        api_key=settings.anthropic_api_key,
    )

    # ── Build AgentSession ────────────────────────────────────────────────────
    # VAD: AgentSession defaults to bundled Silero VAD — no explicit import needed.
    # allow_interruptions=True enables barge-in so user can talk over the AI.
    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts_instance,
        allow_interruptions=True,
    )

    # ── Hook conversation_item_added to persist assistant turns ───────────────
    # This event fires for both user and assistant turns once committed.
    # User turns are handled via CompanionAgent.on_user_turn_completed;
    # assistant turns are captured here to avoid double-counting user turns.
    @session.on("conversation_item_added")
    def _on_conversation_item(event: object) -> None:
        # event is ConversationItemAddedEvent; item is a ChatMessage or AgentHandoff.
        from livekit.agents import ConversationItemAddedEvent
        from livekit.agents.llm import ChatMessage

        if not isinstance(event, ConversationItemAddedEvent):
            return
        msg = event.item
        if not isinstance(msg, ChatMessage):
            return
        if msg.role == "assistant":
            text = msg.text_content or ""
            if text:
                _fire_and_forget(_handle_assistant_turn(state, text))

    # Track session close for cleanup.
    session_closed = asyncio.Event()

    @session.on("close")
    def _on_session_close(event: CloseEvent) -> None:
        logger.info(
            "Session closed: reason=%s conversation=%d user=%s",
            event.reason,
            conversation_id,
            user_id,
        )
        session_closed.set()

    # ── Build and start companion agent ───────────────────────────────────────
    agent = CompanionAgent(
        instructions=companion_prompt,
        state=state,
        session=session,
        stt=stt,
        llm=llm,
        tts=tts_instance,
        allow_interruptions=True,
    )

    # Start the session connected to the room.
    await session.start(agent, room=ctx.room)

    # ── Speak AI disclosure immediately (EU AI Act Art. 50) ───────────────────
    # allow_interruptions=False so the user cannot accidentally skip it.
    await session.say(disclosure_opening, allow_interruptions=False)

    # ── Start periodic disclosure reminder task ────────────────────────────────
    disclosure_task = asyncio.create_task(
        _periodic_disclosure(session, settings.disclosure_reminder_interval_seconds),
        name=f"disclosure-reminder-{conversation_id}",
    )

    # ── Wait for session to close (participant disconnect or room shutdown) ────
    try:
        await session_closed.wait()
    except asyncio.CancelledError:
        pass
    finally:
        disclosure_task.cancel()

        # Mark conversation as ended.
        try:
            await close_conversation(conversation_id)
        except Exception as exc:
            logger.error("Failed to close conversation %d: %s", conversation_id, exc)
            capture_exception(exc, tags={"component": "session", "event": "close_conversation"})

        # Trigger extraction worker.
        await _trigger_extraction(conversation_id)

        logger.info(
            "Entrypoint done: conversation=%d room=%s user=%s tts=%s",
            conversation_id,
            ctx.room.name,
            user_id,
            tts_provider_used,
        )


# ── CLI wiring ─────────────────────────────────────────────────────────────────


def main() -> None:
    """
    Wire up the LiveKit Agents CLI so `dev` and `start` subcommands work.

    Usage:
        uv run python agent.py dev    # local dev with hot-reload
        uv run python agent.py start  # production worker
    """
    # Initialise Sentry early (no-op when SENTRY_DSN is unset or sentry-sdk absent).
    # Must be called before any async code runs so the SDK can install its integrations.
    init_sentry()

    # Eagerly validate config at startup so missing keys fail immediately.
    get_settings()
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            # LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET are read from env
            # automatically by the livekit-agents CLI / WorkerOptions.
        )
    )


if __name__ == "__main__":
    main()
