"""
lib/sentry.py — Sentry initialisation helper for the Done Swiping voice agent.

Sentry is initialised ONLY when SENTRY_DSN is set in the environment.
When the DSN is absent (local dev, CI without secrets) every function is a
no-op so the rest of the codebase never needs to guard against a missing DSN.

Usage:
    from lib.sentry import init_sentry, capture_exception

    init_sentry()                          # call once at process startup
    capture_exception(exc, tags={"component": "extraction"})

IMPORTANT — transcript safety:
    Never pass transcript text, user speech, or any user-authored content
    to Sentry.  Only structural metadata (component name, conversation_id,
    event type) belongs in error reports.  Treat transcripts as GDPR-
    sensitive special-category data — they must never leave the EU region
    via a third-party error-reporting SDK.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Lazily resolved — stays None when sentry-sdk is not installed or DSN is unset.
_sentry_sdk: Any = None
_initialised = False


def _load_sentry() -> Any:
    """Try to import sentry_sdk; return the module or None."""
    try:
        import sentry_sdk  # type: ignore[import-untyped]

        return sentry_sdk
    except ImportError:
        return None


def init_sentry() -> None:
    """
    Initialise Sentry at process startup.

    Safe to call multiple times — subsequent calls are no-ops.
    Does nothing when:
      • SENTRY_DSN is not set in the environment, OR
      • sentry-sdk is not installed (import fails gracefully).
    """
    global _sentry_sdk, _initialised
    if _initialised:
        return
    _initialised = True

    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn:
        # No DSN — run silently without Sentry.
        return

    sdk = _load_sentry()
    if sdk is None:
        logger.warning(
            "SENTRY_DSN is set but sentry-sdk is not installed. "
            "Run `uv sync` to install it.  Continuing without Sentry."
        )
        return

    sdk.init(
        dsn=dsn,
        # Disable HTTP request data capture — we never want user content
        # (transcript text, etc.) automatically attached to Sentry events.
        default_integrations=False,
        # 10 % of transactions for performance monitoring.
        traces_sample_rate=0.1,
        # Never send PII automatically.
        send_default_pii=False,
    )
    _sentry_sdk = sdk
    logger.info("Sentry initialised.")


def capture_exception(
    exc: BaseException,
    *,
    tags: dict[str, str] | None = None,
) -> None:
    """
    Capture an exception in Sentry.

    @param exc   — the exception to report.
    @param tags  — optional safe, non-PII metadata (component, event type, etc.).
                   NEVER include transcript content or user-authored text.
    """
    if _sentry_sdk is None:
        # Sentry not active — nothing to do; callers should already log via the
        # standard logger.
        return

    with _sentry_sdk.push_scope() as scope:
        if tags:
            for k, v in tags.items():
                scope.set_tag(k, v)
        _sentry_sdk.capture_exception(exc)
