"""Supabase access-token verification.

Protects write endpoints so only logged-in users can call them. We validate the
token by asking Supabase's own auth endpoint (`GET /auth/v1/user`) over httpx,
which is signing-algorithm agnostic and uses bundled CA certs — local JWKS
verification via urllib's PyJWKClient failed cert verification on the deploy host.

Disabled — requests pass through — when SUPABASE_URL is unset, so local/mock dev
keeps working without auth.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import Request

from .errors import UNAUTHORIZED, DartError

log = logging.getLogger("dart.auth")


async def verify_token(url: str, api_key: str, token: str) -> str | None:
    """Validate a Supabase access token and return its user id (`sub`), or None.

    Asks Supabase to validate the token (it owns the signing keys), so this works
    regardless of the token's algorithm and never trusts an unverified payload.
    Shared by `require_user` (Authorization header) and `/save-ad` (which carries
    the token as a multipart form field).
    """
    if not token or not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{url.rstrip('/')}/auth/v1/user",
                headers={"Authorization": f"Bearer {token}", "apikey": api_key},
            )
    except Exception as e:
        log.warning("Supabase token check failed: %s", e)
        return None
    if r.status_code != 200:
        return None
    try:
        user_id = r.json().get("id")
    except Exception:
        return None
    return str(user_id) if user_id else None


async def require_user(request: Request) -> str:
    """FastAPI dependency: returns the Supabase user id, or raises 401."""
    settings = request.app.state.settings
    url = settings.supabase_url
    if not url:
        return "anonymous"  # auth disabled (no SUPABASE_URL configured)

    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise DartError(UNAUTHORIZED, "Sign in required.", status=401)
    token = header[7:].strip()

    sub = await verify_token(url, settings.supabase_service_key or "", token)
    if not sub:
        raise DartError(UNAUTHORIZED, "Invalid or expired session.", status=401)
    return sub
