"""Signup email codes, owned by Dart (not Supabase's mailer).

The flow: the frontend asks for a code, we email a 6-digit code via Brevo and
store only its hash; when the user types it back we verify and *then* create the
Supabase account (admin API, pre-confirmed). Until the code verifies, the
account simply does not exist — there is nothing to sign in to, so the flow
can't be bypassed by refreshing or signing in early.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

import httpx

from .config import Settings

MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SEC = 60
_TIMEOUT = 15.0

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


def email_ready(settings: Settings) -> bool:
    return bool(settings.brevo_api_key and settings.auth_email_from)


def gen_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(settings: Settings, email: str, code: str) -> str:
    # Peppered with the service key so a leaked table row can't be reversed to
    # a code offline. Codes are 6 digits with a 5-attempt cap and short TTL.
    pepper = settings.supabase_service_key or ""
    return hashlib.sha256(f"{email.lower()}|{code}|{pepper}".encode()).hexdigest()


def _sb(settings: Settings) -> tuple[str, dict[str, str]]:
    key = settings.supabase_service_key
    base = (settings.supabase_url or "").rstrip("/")
    return base, {"Authorization": f"Bearer {key}", "apikey": key}


async def user_exists(settings: Settings, email: str) -> bool:
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(
            f"{base}/rest/v1/rpc/user_exists", headers=auth, json={"p_email": email}
        )
        r.raise_for_status()
        return bool(r.json())


async def get_code_row(settings: Settings, email: str) -> dict | None:
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(
            f"{base}/rest/v1/auth_codes",
            headers=auth,
            params={"email": f"eq.{email}", "select": "*"},
        )
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None


async def store_code(settings: Settings, email: str, code_hash: str) -> None:
    base, auth = _sb(settings)
    now = datetime.now(timezone.utc)
    expires = now.timestamp() + settings.auth_code_ttl_sec
    row = {
        "email": email,
        "code_hash": code_hash,
        "attempts": 0,
        "expires_at": datetime.fromtimestamp(expires, tz=timezone.utc).isoformat(),
        "created_at": now.isoformat(),
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(
            f"{base}/rest/v1/auth_codes",
            headers={**auth, "Prefer": "resolution=merge-duplicates"},
            json=row,
        )
        r.raise_for_status()


async def bump_attempts(settings: Settings, email: str, attempts: int) -> None:
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        await client.patch(
            f"{base}/rest/v1/auth_codes",
            headers=auth,
            params={"email": f"eq.{email}"},
            json={"attempts": attempts},
        )


async def delete_code(settings: Settings, email: str) -> None:
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        await client.delete(
            f"{base}/rest/v1/auth_codes", headers=auth, params={"email": f"eq.{email}"}
        )


async def send_code_email(settings: Settings, to: str, code: str) -> None:
    """Email the code via Brevo's free transactional API. Raises on failure."""
    html = (
        "<div style='font-family:sans-serif'>"
        "<h2>Your Dart signup code</h2>"
        f"<p style='font-size:32px;letter-spacing:8px;font-weight:bold'>{code}</p>"
        "<p>Enter this code to finish creating your account. It expires in "
        f"{settings.auth_code_ttl_sec // 60} minutes. If you didn’t request it, "
        "you can ignore this email.</p></div>"
    )
    payload = {
        "sender": {"email": settings.auth_email_from, "name": settings.auth_email_from_name},
        "to": [{"email": to}],
        "subject": "Your Dart signup code",
        "htmlContent": html,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(
            BREVO_SEND_URL,
            headers={"api-key": settings.brevo_api_key, "content-type": "application/json"},
            json=payload,
        )
        r.raise_for_status()


async def create_confirmed_user(settings: Settings, email: str, password: str) -> str:
    """Create the account (pre-confirmed) via the GoTrue admin API.

    Returns "ok" or "exists". Anything else raises.
    """
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(
            f"{base}/auth/v1/admin/users",
            headers=auth,
            json={"email": email, "password": password, "email_confirm": True},
        )
        if r.status_code in (200, 201):
            return "ok"
        if "already" in r.text.lower() or r.status_code == 422:
            return "exists"
        r.raise_for_status()
        return "ok"  # unreachable; keeps type-checkers happy


__all__ = [
    "MAX_ATTEMPTS",
    "RESEND_COOLDOWN_SEC",
    "email_ready",
    "gen_code",
    "hash_code",
    "user_exists",
    "get_code_row",
    "store_code",
    "bump_attempts",
    "delete_code",
    "send_code_email",
    "create_confirmed_user",
]
