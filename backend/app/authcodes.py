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
VIDEO_BUCKET = "dart-videos"  # matches main.VIDEO_BUCKET (import would be circular)
_LIST_PAGE = 1000  # Supabase storage list caps a single response at 1000 rows.


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
    elif purpose == "email":
        subject = "Your Dart email change code"
        action = "Enter this code to make this address your new Dart login email."
        unasked = "you can ignore this email and nothing will change."
    elif purpose == "password":
        subject = "Your Dart password change code"
        action = "Enter this code to confirm changing your password."
        unasked = "you can ignore this email and your password stays the same."
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


async def get_token_user(settings: Settings, token: str) -> tuple[str, str] | None:
    """Resolve an access token to (user_id, email) via GoTrue, or None."""
    if not token:
        return None
    base, _ = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(
            f"{base}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_service_key or "",
            },
        )
    if r.status_code != 200:
        return None
    data = r.json()
    uid, email = data.get("id"), data.get("email")
    return (str(uid), str(email)) if uid and email else None


async def check_password(settings: Settings, email: str, password: str) -> bool:
    """True when email+password signs in (GoTrue password grant).

    The grant mints a session; since these are confirm-only checks we throw the
    tokens away, so revoke just that one session (scope=local) to keep the
    refresh-token table from filling with dead rows."""
    base, _ = _sb(settings)
    apikey = settings.supabase_service_key or ""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(
            f"{base}/auth/v1/token?grant_type=password",
            headers={"apikey": apikey},
            json={"email": email, "password": password},
        )
        if r.status_code != 200:
            return False
        access = r.json().get("access_token")
        if access:
            try:
                await client.post(
                    f"{base}/auth/v1/logout?scope=local",
                    headers={"apikey": apikey, "Authorization": f"Bearer {access}"},
                )
            except Exception:  # noqa: BLE001 — cleanup only; the check already passed
                pass
    return True


async def _list_all_objects(
    client: httpx.AsyncClient, base: str, auth: dict[str, str], user_id: str
) -> list[dict]:
    """Every object under the user's prefix, paging past the 1000-row cap so a
    large library isn't silently truncated (undercounted usage, orphaned files
    on delete)."""
    out: list[dict] = []
    offset = 0
    while True:
        r = await client.post(
            f"{base}/storage/v1/object/list/{VIDEO_BUCKET}",
            headers=auth,
            json={"prefix": f"{user_id}/", "limit": _LIST_PAGE, "offset": offset},
        )
        r.raise_for_status()
        page = r.json()
        out.extend(page)
        if len(page) < _LIST_PAGE:
            return out
        offset += _LIST_PAGE


async def delete_user_data(settings: Settings, user_id: str) -> None:
    """Remove the user's library rows and stored files. Runs before the account
    itself is deleted, so a failure leaves the account intact and retryable."""
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.delete(
            f"{base}/rest/v1/dart_ads", headers=auth, params={"user_id": f"eq.{user_id}"}
        )
        r.raise_for_status()
        objects = await _list_all_objects(client, base, auth, user_id)
        names = [f"{user_id}/{o['name']}" for o in objects if o.get("name")]
        # Delete in pages too — the remove body has the same practical ceiling.
        for i in range(0, len(names), _LIST_PAGE):
            r = await client.request(
                "DELETE",
                f"{base}/storage/v1/object/{VIDEO_BUCKET}",
                headers=auth,
                json={"prefixes": names[i : i + _LIST_PAGE]},
            )
            r.raise_for_status()


async def storage_usage(settings: Settings, user_id: str) -> int:
    """Total bytes stored under the user's prefix in the video bucket."""
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        objects = await _list_all_objects(client, base, auth, user_id)
    total = 0
    for o in objects:
        size = (o.get("metadata") or {}).get("size")
        if isinstance(size, (int, float)):
            total += int(size)
    return total


async def delete_user(settings: Settings, user_id: str) -> None:
    """Delete the account via the GoTrue admin API."""
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.delete(f"{base}/auth/v1/admin/users/{user_id}", headers=auth)
    r.raise_for_status()


async def set_user_email(settings: Settings, user_id: str, email: str) -> str:
    """Point the account at a new (already code-verified) email via the admin
    API. Returns "ok", or "exists" when the address belongs to another account."""
    base, auth = _sb(settings)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.put(
            f"{base}/auth/v1/admin/users/{user_id}",
            headers=auth,
            json={"email": email, "email_confirm": True},
        )
    if r.status_code == 200:
        return "ok"
    body = r.text.lower()
    if "already" in body or "email_exists" in body:
        return "exists"
    if r.status_code in (400, 422):
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
    "set_user_email",
    "get_token_user",
    "check_password",
    "storage_usage",
    "delete_user_data",
    "delete_user",
]
