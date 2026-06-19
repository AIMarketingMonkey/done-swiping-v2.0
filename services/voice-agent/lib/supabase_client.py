"""
lib/supabase_client.py — Supabase service-role client for the voice agent.

Used by all backend writes: transcript_turns, conversations, safety_flags,
inferred_traits, profile_attributes, embeddings.

The service-role key bypasses RLS.  This module must ONLY be used server-side
(inside the voice agent process, never exposed to clients).
"""

from __future__ import annotations

import logging
from functools import lru_cache

from supabase import Client, create_client

from lib.config import ConfigError, get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """
    Return the process-wide Supabase service-role client (lazy, cached).

    Raises ConfigError if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are absent.
    Raises RuntimeError if the client cannot be created (e.g. malformed URL).
    """
    settings = get_settings()

    if not settings.supabase_url:
        raise ConfigError("SUPABASE_URL is not set.")
    if not settings.supabase_service_role_key:
        raise ConfigError("SUPABASE_SERVICE_ROLE_KEY is not set.")

    try:
        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to create Supabase client (URL={settings.supabase_url!r}): {exc}"
        ) from exc

    logger.info("Supabase service-role client created (URL=%s)", settings.supabase_url)
    return client


# ── Typed helpers used by agent.py and extraction/worker.py ──────────────────


async def insert_conversation(
    user_id: str,
    room_name: str,
    *,
    retention_days: int = 30,
) -> dict:
    """
    Insert a new row into the `conversations` table and return it.

    TODO(M2): confirm column names match the Supabase migration.
    """
    from datetime import UTC, datetime, timedelta

    db = get_supabase()
    now = datetime.now(UTC)
    row = {
        "user_id": user_id,
        "room_name": room_name,
        "started_at": now.isoformat(),
        "retention_expires_at": (now + timedelta(days=retention_days)).isoformat(),
    }
    result = db.table("conversations").insert(row).execute()
    return result.data[0]


async def close_conversation(conversation_id: int) -> None:
    """
    Set `ended_at` on a conversation row.

    TODO(M2): confirm PK column name (id vs conversation_id) in migration.
    """
    from datetime import UTC, datetime

    db = get_supabase()
    db.table("conversations").update(
        {"ended_at": datetime.now(UTC).isoformat()}
    ).eq("id", conversation_id).execute()


async def insert_transcript_turn(
    *,
    conversation_id: int,
    role: str,  # "user" | "assistant"
    text: str,
    turn_index: int,
    retention_expires_at: str,
) -> dict:
    """
    Persist a single transcript turn (text only — NO raw audio).

    Column `role` is one of 'user' | 'assistant'.
    `retention_expires_at` must be an ISO-8601 UTC string.

    TODO(M2): confirm column names match the `transcript_turns` migration.
    """
    db = get_supabase()
    row = {
        "conversation_id": conversation_id,
        "role": role,
        "text": text,
        "turn_index": turn_index,
        "retention_expires_at": retention_expires_at,
    }
    result = db.table("transcript_turns").insert(row).execute()
    return result.data[0]
