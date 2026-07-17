"""Error monitoring (Sentry) — fully env-gated.

No SENTRY_DSN → init_sentry() is a no-op: no SDK init, no network, no cost, so
local dev and CI stay clean. Set SENTRY_DSN in the deploy environment to turn
it on. Errors-only by default (traces_sample_rate 0) to keep quota low.
"""

from __future__ import annotations

import logging

from .config import Settings
from .errors import DartError

log = logging.getLogger("dart.monitoring")

# Module-level guard so a repeated create_app() (tests build many apps) doesn't
# re-init the global Sentry client over and over.
_initialized = False


def _before_send(event, hint):
    """Drop expected domain errors so Sentry only sees genuine faults.

    DartError is the app's own 4xx/handled-error type — it's converted to a
    clean JSON envelope by the exception handler and is never a bug, so it must
    not page anyone. Only unhandled exceptions (real 500s) get through.
    """
    exc = (hint or {}).get("exc_info")
    if exc and isinstance(exc[1], DartError):
        return None
    return event


def init_sentry(settings: Settings) -> bool:
    """Initialise Sentry if a DSN is configured. Returns whether it's active."""
    global _initialized
    if _initialized:
        return True
    if not settings.sentry_dsn:
        return False
    try:
        import sentry_sdk
    except ImportError:  # pragma: no cover - dependency guard
        log.warning("SENTRY_DSN set but sentry-sdk is not installed; skipping.")
        return False

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # Don't attach request bodies — /save-ad carries the session token and
        # video bytes, /auth carries codes. Keep PII out of the error stream.
        send_default_pii=False,
        before_send=_before_send,
    )
    _initialized = True
    log.info("Sentry error monitoring enabled (env=%s).", settings.sentry_environment)
    return True
