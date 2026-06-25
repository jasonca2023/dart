"""Supabase JWT verification.

Protects write endpoints so only logged-in users can call them. The frontend
sends the Supabase access token as `Authorization: Bearer <token>`; we verify its
ES256 signature against the project's public JWKS (no shared secret needed).

Disabled — requests pass through — when SUPABASE_URL is unset, so local/mock dev
keeps working without auth.
"""

from __future__ import annotations

import logging

from fastapi import Request

from .errors import UNAUTHORIZED, DartError

log = logging.getLogger("dart.auth")

_jwks_client = None  # lazily built, caches keys after first fetch


def _jwks(url: str):
    global _jwks_client
    if _jwks_client is None:
        import jwt

        _jwks_client = jwt.PyJWKClient(
            f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        )
    return _jwks_client


def verify_token(url: str, token: str) -> str | None:
    """Verify a Supabase access token's ES256/RS256 signature against the project
    JWKS and return its `sub` (user id), or None when the token is invalid/expired.

    Shared by `require_user` (Authorization header) and `/save-ad` (which carries
    the token as a multipart form field) so both trust the same verification —
    never decode a token's payload without checking its signature first.
    """
    try:
        import jwt

        signing_key = _jwks(url).get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except Exception as e:
        log.warning("Supabase token verification failed: %s", e)
        return None

    sub = payload.get("sub")
    return str(sub) if sub else None


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

    sub = verify_token(url, token)
    if not sub:
        raise DartError(UNAUTHORIZED, "Invalid or expired session.", status=401)
    return sub
