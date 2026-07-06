"""Lightweight in-memory per-IP rate limiting.

The service runs as a single instance (Render free tier), so an in-process
sliding-window counter is enough to blunt abuse of the public endpoints — the
open image/scrape proxies and the save path — with no external store. Keyed on
the forwarded client IP. A no-op when settings.rate_limit_enabled is False
(tests, or local dev with no proxy in front).
"""

from __future__ import annotations

import ipaddress
import time
from collections import defaultdict, deque

from fastapi import Request

from .errors import RATE_LIMITED, DartError

_PRUNE_AT = 20_000  # sweep idle IP buckets once the table grows past this


def client_ip(request: Request) -> str:
    # X-Forwarded-For is spoofable on the LEFT — a client can prepend fake hops.
    # A trusted proxy (Render) APPENDS the real peer on the right, so walk the
    # chain right-to-left and take the first PUBLIC address, skipping any private
    # infra hops. That's the actual client and can't be forged from the request;
    # keying on the leftmost value would let an attacker mint a fresh rate-limit
    # bucket per request just by rotating the header.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        for candidate in reversed(parts):
            try:
                if not ipaddress.ip_address(candidate).is_private:
                    return candidate
            except ValueError:
                continue
        if parts:
            return parts[-1]
    return request.client.host if request.client else "unknown"


class _SlidingWindow:
    def __init__(self, window_sec: float) -> None:
        self.window = window_sec
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int) -> bool:
        now = time.monotonic()
        cutoff = now - self.window
        dq = self._hits[key]
        while dq and dq[0] <= cutoff:
            dq.popleft()
        # Keep the table from growing unbounded across many distinct IPs.
        if not dq and len(self._hits) > _PRUNE_AT:
            for k in [k for k, d in self._hits.items() if not d]:
                del self._hits[k]
            dq = self._hits[key]
        if len(dq) >= limit:
            return False
        dq.append(now)
        return True


def rate_limit(
    default_limit: int, *, window_sec: float = 60.0, limit_attr: str | None = None
):
    """Build a FastAPI dependency allowing `default_limit` requests per window per
    client IP (overridable at runtime via the `limit_attr` setting). Call once per
    endpoint and reuse the returned dependency — each owns its own window."""
    window = _SlidingWindow(window_sec)

    async def dependency(request: Request) -> None:
        settings = getattr(request.app.state, "settings", None)
        if settings is not None and not getattr(settings, "rate_limit_enabled", True):
            return
        limit = (
            getattr(settings, limit_attr, default_limit)
            if settings is not None and limit_attr
            else default_limit
        )
        if not window.allow(client_ip(request), limit):
            raise DartError(
                RATE_LIMITED,
                "Too many requests — slow down and try again shortly.",
                status=429,
                retryable=True,
            )

    return dependency
