"""
agent.py — Done Swiping voice agent entrypoint.

Pipeline: Deepgram Flux STT → Claude Sonnet (brain) → Cartesia TTS, with
Silero VAD and barge-in/interruption enabled.

Compliance:
- AI disclosure spoken at session start (opening line from companion.md).
- Periodic disclosure reminder for long sessions.
- All user speech treated as DATA, never as instructions.
- Only transcript text persisted — NO raw audio stored long-term.
- transcript_turns rows carry retention_expires_at (now + 30 days).
- On disconnect: conversations.ended_at set, extraction worker triggered.

Dev command:  uv run python agent.py dev
Start command: uv run python agent.py start

TODO(M2): confirm exact livekit-agents API (class names, plugin constructors,
session event hooks) against the installed package version.  The livekit-agents
API has been volatile between 0.9-0.12; review the changelog before M2 wiring.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

# livekit-agents imports
# TODO(M2): confirm module paths against installed livekit-agents version.
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli
from livekit.agents import llm as agents_llm
from livekit.agents.voice_assistant import VoiceAssistant  # TODO(M2): verify class name
from livekit.plugins import anthropic as lk_anthropic
from livekit.plugins import cartesia as lk_cartesia
from livekit.plugins import deepgram as lk_deepgram
from livekit.plugins import silero as lk_silero

from lib.config import get_settings
from lib.safety import classify_turn, persist_flag
from lib.supabase_client import (
    close_conversation,
    insert_conversation,
    insert_transcript_turn,
)

logger = logging.getLogger(__name__)

# Module-level set to hold strong references to fire-and-forget tasks,
# preventing them from being GC'd before completion (PEP 3156 / RUF006).
_background_tasks: set[asyncio.Task] = set()


def _fire_and_forget(coro: asyncio.coroutines) -> asyncio.Task:  # type: ignore[type-arg]
    """Schedule a coroutine as a background task and keep a strong reference."""
    task = asyncio.ensure_future(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


# ── Prompt loading ────────────────────────────────────────────────────────────

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

    The companion.md specifies the opening line under '## Tone examples' as
    the text beginning with 'Before we start —'.  Falls back to a safe default
    if the expected marker is not found.
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


# ── Turn handler ──────────────────────────────────────────────────────────────


class _SessionState:
    """Mutable state scoped to a single LiveKit room session."""

    def __init__(self, conversation_id: int, retention_expires_at: str) -> None:
        self.conversation_id = conversation_id
        self.retention_expires_at = retention_expires_at
        self.turn_index: int = 0
        self.last_turn_id: int | None = None
        self._lock = asyncio.Lock()

    async def next_turn_index(self) -> int:
        async with self._lock:
            idx = self.turn_index
            self.turn_index += 1
            return idx


async def _handle_user_turn(
    state: _SessionState,
    user_text: str,
) -> None:
    """
    Called on each finalised user speech turn.

    Fires safety classification in parallel (non-blocking for the reply),
    then persists the transcript turn to Supabase.

    TODO(M2): wire this to the VoiceAssistant event system (on_user_speech_committed
    or equivalent callback — confirm event name against installed version).
    """
    turn_idx = await state.next_turn_index()

    # Fire safety classification without blocking the LLM reply.
    safety_task = asyncio.create_task(
        classify_turn(user_text),
        name=f"safety-{state.conversation_id}-{turn_idx}",
    )

    # Persist transcript turn (text only, no audio).
    try:
        row = await insert_transcript_turn(
            conversation_id=state.conversation_id,
            role="user",
            text=user_text,
            turn_index=turn_idx,
            retention_expires_at=state.retention_expires_at,
        )
        state.last_turn_id = row.get("id")
    except Exception as exc:
        logger.error("Failed to persist user turn %d: %s", turn_idx, exc)

    # Await safety result and persist flag if needed.
    try:
        safety_result = await safety_task
        if safety_result["flagged"]:
            await persist_flag(
                conversation_id=state.conversation_id,
                turn_id=state.last_turn_id,
                result=safety_result,
                user_text=user_text,  # passed for context; persist_flag logs only turn_id
            )
    except Exception as exc:
        logger.error("Safety pipeline error (non-fatal): %s", exc)


async def _handle_assistant_turn(
    state: _SessionState,
    assistant_text: str,
) -> None:
    """
    Persist an assistant speech turn to the transcript.

    TODO(M2): wire to VoiceAssistant on_agent_speech_committed or equivalent.
    """
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


# ── Periodic disclosure reminder ──────────────────────────────────────────────


async def _periodic_disclosure(
    assistant: VoiceAssistant,
    interval_seconds: int,
    disclosure_line: str,
) -> None:
    """
    Periodically inject a brief AI disclosure reminder for long sessions.

    Complies with EU AI Act Art. 50 — disclose at first interaction AND again
    during long or emotionally heavy sessions.

    TODO(M2): replace `assistant.say()` with the correct method for the
    installed livekit-agents version (may be `session.say()` or similar).
    """
    reminder = (
        "Just a quick reminder — I'm an AI, not a human, "
        "and everything we talk about stays between you and the app."
    )
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            # TODO(M2): confirm method signature (say vs speak vs generate_reply).
            await assistant.say(reminder, allow_interruptions=True)
            logger.info("Periodic AI disclosure reminder spoken.")
        except Exception as exc:
            logger.warning("Failed to speak disclosure reminder: %s", exc)


# ── Extraction trigger ────────────────────────────────────────────────────────


async def _trigger_extraction(conversation_id: int) -> None:
    """
    Enqueue the extraction worker for a completed conversation.

    M0: runs the extraction function in-process as a fire-and-forget task.
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


# ── Main entrypoint ───────────────────────────────────────────────────────────


async def entrypoint(ctx: JobContext) -> None:
    """
    LiveKit Agents entrypoint — called once per room/job.

    Wires up the voice pipeline and manages session lifecycle.

    TODO(M2): confirm JobContext API (room, participant attributes, accept())
    against installed livekit-agents version.
    """
    settings = get_settings()
    logger.info(
        "Voice agent starting: room=%s brain=%s worker=%s",
        ctx.room.name,
        settings.brain_model,
        settings.worker_model,
    )

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Resolve user_id from room metadata or participant identity.
    # TODO(M2): confirm how user_id is passed — likely via room metadata or
    # participant.identity set by the token-generation API.
    participant = await ctx.wait_for_participant()
    user_id: str = participant.identity or "unknown"

    # ── Supabase conversation row ─────────────────────────────────────────────
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

    # ── Load companion system prompt ──────────────────────────────────────────
    companion_prompt = _load_companion_prompt()
    disclosure_opening = _extract_disclosure_opening(companion_prompt)

    # ── Build LLM chat context ────────────────────────────────────────────────
    # TODO(M2): confirm agents_llm.ChatContext API — may differ by version.
    initial_ctx = agents_llm.ChatContext().append(
        role="system",
        text=companion_prompt,
    )

    # ── Assemble voice pipeline ───────────────────────────────────────────────
    # TODO(M2): confirm plugin constructor signatures against installed versions.
    # Deepgram Flux: model name "nova-3" or check Deepgram docs for Flux alias.
    stt = lk_deepgram.STT(
        model="nova-3",  # TODO(M2): confirm Deepgram Flux model string
        api_key=settings.deepgram_api_key,
        language="en-GB",
    )

    llm = lk_anthropic.LLM(
        model=settings.brain_model,
        api_key=settings.anthropic_api_key,
    )

    # TODO(M2): confirm Cartesia voice_id / model; load from env or config.
    tts = lk_cartesia.TTS(
        api_key=settings.cartesia_api_key,
        # voice_id and model_id should come from env in M2.
        # TODO(M2): add CARTESIA_VOICE_ID and CARTESIA_MODEL_ID to .env.example.
    )

    vad = lk_silero.VAD.load()

    # TODO(M2): confirm VoiceAssistant constructor kwargs for barge-in:
    # `allow_interruptions` / `interrupt_speech_duration` may have changed.
    assistant = VoiceAssistant(
        vad=vad,
        stt=stt,
        llm=llm,
        tts=tts,
        chat_ctx=initial_ctx,
        allow_interruptions=True,
        interrupt_speech_duration=0.5,  # TODO(M2): tune after live testing
    )

    # ── Wire speech turn callbacks ────────────────────────────────────────────
    # TODO(M2): confirm event names on VoiceAssistant:
    # may be on("user_speech_committed", ...) or on_user_speech_committed = ...

    @assistant.on("user_speech_committed")  # TODO(M2): verify event name
    def _on_user_speech(message: agents_llm.ChatMessage) -> None:
        """Non-blocking: fire safety + persist in background."""
        _fire_and_forget(_handle_user_turn(state, message.content or ""))

    @assistant.on("agent_speech_committed")  # TODO(M2): verify event name
    def _on_agent_speech(message: agents_llm.ChatMessage) -> None:
        _fire_and_forget(_handle_assistant_turn(state, message.content or ""))

    # ── Start assistant ───────────────────────────────────────────────────────
    assistant.start(ctx.room, participant)

    # Speak AI disclosure immediately at session start (EU AI Act Art. 50).
    # TODO(M2): confirm assistant.say() method signature.
    await assistant.say(disclosure_opening, allow_interruptions=False)

    # Start periodic disclosure reminder task.
    disclosure_task = asyncio.create_task(
        _periodic_disclosure(
            assistant,
            settings.disclosure_reminder_interval_seconds,
            disclosure_opening,
        ),
        name=f"disclosure-reminder-{conversation_id}",
    )

    # ── Wait for session end (participant disconnect or room close) ───────────
    # TODO(M2): confirm the correct signal to await (ctx.wait_for_disconnect()
    # or room event) against installed livekit-agents version.
    try:
        await asyncio.Event().wait()  # placeholder; TODO(M2): use proper signal
    except asyncio.CancelledError:
        pass
    finally:
        disclosure_task.cancel()

        # Mark conversation as ended.
        try:
            await close_conversation(conversation_id)
        except Exception as exc:
            logger.error("Failed to close conversation %d: %s", conversation_id, exc)

        # Trigger extraction worker.
        await _trigger_extraction(conversation_id)

        logger.info(
            "Session ended: conversation=%d room=%s user=%s",
            conversation_id,
            ctx.room.name,
            user_id,
        )


# ── CLI wiring ────────────────────────────────────────────────────────────────


def main() -> None:
    """
    Wire up the LiveKit Agents CLI so `dev` and `start` subcommands work.

    Usage:
        uv run python agent.py dev    # local dev with hot-reload
        uv run python agent.py start  # production worker
    """
    # Eagerly validate config at startup so missing keys fail immediately.
    get_settings()
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            # TODO(M2): add worker_type, api_key, api_secret, url if not
            # auto-read from env by the livekit-agents CLI.
        )
    )


if __name__ == "__main__":
    main()
