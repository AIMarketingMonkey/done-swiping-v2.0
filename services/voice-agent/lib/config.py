"""
lib/config.py — typed settings for the Done Swiping voice agent.

Reads from the repo-root .env (python-dotenv walks up the directory tree).
All public attributes are typed; accessing a missing required key raises a
descriptive ConfigError rather than a silent None.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import find_dotenv, load_dotenv

# ── Load .env (repo root preferred) ──────────────────────────────────────────

_dotenv_path = find_dotenv(usecwd=False)  # walks up from cwd to find .env
if _dotenv_path:
    load_dotenv(_dotenv_path, override=False)  # don't override real env vars
else:
    # Fallback: load from repo root relative to this file's location
    _repo_root = Path(__file__).parent.parent.parent.parent
    _fallback = _repo_root / ".env"
    if _fallback.exists():
        load_dotenv(_fallback, override=False)


class ConfigError(RuntimeError):
    """Raised when a required env var is missing at access time."""


def _require(key: str) -> str:
    """Return the env var value or raise ConfigError with a helpful message."""
    value = os.environ.get(key)
    if not value:
        raise ConfigError(
            f"Required environment variable '{key}' is not set. "
            f"Copy .env.example → <repo-root>/.env and fill in all values."
        )
    return value


def _optional(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


# ── Settings dataclass ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Settings:
    """
    Centralised, typed configuration for the voice agent.

    Accessed as a singleton via `get_settings()`.  Fields that call `_require`
    will raise ConfigError when the env var is absent — fail fast, fail loud.
    """

    # LiveKit
    livekit_url: str = field(default_factory=lambda: _require("LIVEKIT_URL"))
    livekit_api_key: str = field(default_factory=lambda: _require("LIVEKIT_API_KEY"))
    livekit_api_secret: str = field(default_factory=lambda: _require("LIVEKIT_API_SECRET"))

    # STT
    deepgram_api_key: str = field(default_factory=lambda: _require("DEEPGRAM_API_KEY"))

    # LLM
    anthropic_api_key: str = field(default_factory=lambda: _require("ANTHROPIC_API_KEY"))
    # Model strings default to the values agreed in the project brief (verify quarterly).
    brain_model: str = field(
        default_factory=lambda: _optional("BRAIN_MODEL", "claude-sonnet-4-6")
    )
    worker_model: str = field(
        default_factory=lambda: _optional("WORKER_MODEL", "claude-haiku-4-5-20251001")
    )

    # TTS — provider selection
    # tts_provider: "cartesia" | "elevenlabs" | "ab"
    #   "ab" enables a stable 50/50 A/B split per session (room-name hash).
    tts_provider: str = field(
        default_factory=lambda: _optional("TTS_PROVIDER", "cartesia")
    )

    # Cartesia TTS
    cartesia_api_key: str = field(default_factory=lambda: _require("CARTESIA_API_KEY"))
    # Voice and model IDs for Cartesia.  Defaults are sensible for UK-English dating context.
    cartesia_voice_id: str = field(
        default_factory=lambda: _optional(
            "CARTESIA_VOICE_ID", "f786b574-daa5-4673-aa0c-cbe3e8534c02"
        )
    )
    cartesia_model_id: str = field(
        default_factory=lambda: _optional("CARTESIA_MODEL_ID", "sonic-3")
    )

    # ElevenLabs TTS (used when tts_provider="elevenlabs" or the B arm of A/B)
    elevenlabs_api_key: str = field(
        default_factory=lambda: _optional("ELEVENLABS_API_KEY", "")
    )
    elevenlabs_voice_id: str = field(
        default_factory=lambda: _optional("ELEVENLABS_VOICE_ID", "hpp4J3VqNfWAUOO0d1Us")
    )

    # Supabase
    supabase_url: str = field(default_factory=lambda: _require("SUPABASE_URL"))
    supabase_service_role_key: str = field(
        default_factory=lambda: _require("SUPABASE_SERVICE_ROLE_KEY")
    )

    # Embeddings (provider-agnostic HTTP call)
    embeddings_api_key: str = field(
        default_factory=lambda: _optional("EMBEDDINGS_API_KEY", "")
    )
    embeddings_model: str = field(
        default_factory=lambda: _optional("EMBEDDINGS_MODEL", "text-embedding-3-small")
    )
    embeddings_dimension: int = 1536

    # Compliance / session behaviour
    # After this many minutes, trigger a periodic AI disclosure reminder.
    disclosure_reminder_interval_seconds: int = 600  # 10 min

    # Transcript retention: 30 days (GDPR minimum feasible).
    transcript_retention_days: int = 30


_settings: Settings | None = None


def get_settings() -> Settings:
    """Return the process-wide Settings singleton (lazy-initialised)."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
