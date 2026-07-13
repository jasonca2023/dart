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
from .errors import INVALID_INPUT, DartError

MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SEC = 60
_TIMEOUT = 15.0

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


def email_ready(settings: Settings) -> bool:
    return bool(settings.brevo_api_key and settings.auth_email_from)


def gen_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def gen_request() -> str:
    # Opaque token returned to the browser that asked for the code. Guesses
    # must present it, so third parties can't burn the owner's attempt cap.
    return secrets.token_hex(16)


def hash_request(settings: Settings, email: str, request: str) -> str:
    pepper = settings.supabase_service_key or ""
    return hashlib.sha256(f"{email.lower()}|{request}|{pepper}|request".encode()).hexdigest()


def hash_code(settings: Settings, email: str, code: str, purpose: str = "signup") -> str:
    # Peppered with the service key so a leaked table row can't be reversed to
    # a code offline. Codes are 6 digits with a 5-attempt cap and short TTL.
    # The purpose is part of the pre-image, so a signup code can never verify
    # as a password-reset code (or vice versa).
    pepper = settings.supabase_service_key or ""
    return hashlib.sha256(
        f"{email.lower()}|{code}|{pepper}|{purpose}".encode()
    ).hexdigest()


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


async def user_id_by_email(settings: Settings, email: str) -> str | None:
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(
            f"{base}/rest/v1/rpc/user_id_by_email", headers=auth, json={"p_email": email}
        )
        r.raise_for_status()
        return r.json() or None


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


async def store_code(
    settings: Settings, email: str, code_hash: str, request_hash: str
) -> None:
    base, auth = _sb(settings)
    now = datetime.now(timezone.utc)
    expires = now.timestamp() + settings.auth_code_ttl_sec
    row = {
        "email": email,
        "code_hash": code_hash,
        "request_hash": request_hash,
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
    # Must not fail silently — the attempt counter is what enforces MAX_ATTEMPTS.
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.patch(
            f"{base}/rest/v1/auth_codes",
            headers=auth,
            params={"email": f"eq.{email}"},
            json={"attempts": attempts},
        )
        r.raise_for_status()


async def delete_code(settings: Settings, email: str) -> None:
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.delete(
            f"{base}/rest/v1/auth_codes", headers=auth, params={"email": f"eq.{email}"}
        )
        r.raise_for_status()


async def send_code_email(
    settings: Settings, to: str, code: str, purpose: str = "signup"
) -> None:
    """Email the code via Brevo's free transactional API. Raises on failure."""
    if purpose == "reset":
        subject = "Your Dart password reset code"
        action = "Enter this code to set a new password."
        unasked = "you can ignore this email — your password is unchanged."
    else:
        subject = "Your Dart signup code"
        action = "Enter this code to finish creating your account."
        unasked = "you can ignore this email."
    html = (
        "<div style='font-family:sans-serif'>"
        f"<h2>{subject}</h2>"
        f"<p style='font-size:32px;letter-spacing:8px;font-weight:bold'>{code}</p>"
        f"<p>{action} It expires in "
        f"{settings.auth_code_ttl_sec // 60} minutes. If you didn’t request it, "
        f"{unasked}</p></div>"
    )
    payload = {
        "sender": {"email": settings.auth_email_from, "name": settings.auth_email_from_name},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(
            BREVO_SEND_URL,
            headers={"api-key": settings.brevo_api_key, "content-type": "application/json"},
            json=payload,
        )
        r.raise_for_status()


def _gotrue_msg(r: httpx.Response) -> str:
    try:
        data = r.json()
    except ValueError:
        return "Supabase rejected the signup."
    msg = data.get("msg") or data.get("message") or data.get("error_description")
    return msg if isinstance(msg, str) and msg else "Supabase rejected the signup."


async def create_confirmed_user(settings: Settings, email: str, password: str) -> str:
    """Create the account (pre-confirmed) via the GoTrue admin API.

    Returns "ok" or "exists". A password the project's policy rejects surfaces
    as a 400 DartError; anything else raises.
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
    body = r.text.lower()
    if "already" in body or "email_exists" in body:
        return "exists"
    if r.status_code in (400, 422):
        # GoTrue also 422s a password its policy rejects — a user error, not a
        # conflict. Surface GoTrue's own message so they know what to change.
        raise DartError(INVALID_INPUT, _gotrue_msg(r), status=400)
    r.raise_for_status()
    return "ok"  # unreachable; keeps type-checkers happy


async def set_user_password(settings: Settings, user_id: str, password: str) -> None:
    """Set an existing user's password via the GoTrue admin API."""
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.put(
            f"{base}/auth/v1/admin/users/{user_id}",
            headers=auth,
            json={"password": password},
        )
    if r.status_code == 200:
        return
    if r.status_code in (400, 422):
        # Most likely the project's password policy — the user's to fix.
        raise DartError(INVALID_INPUT, _gotrue_msg(r), status=400)
    r.raise_for_status()


__all__ = [
    "MAX_ATTEMPTS",
    "RESEND_COOLDOWN_SEC",
    "email_ready",
    "gen_code",
    "gen_request",
    "hash_code",
    "hash_request",
    "user_exists",
    "user_id_by_email",
    "get_code_row",
    "store_code",
    "bump_attempts",
    "delete_code",
    "send_code_email",
    "create_confirmed_user",
    "set_user_password",
]
