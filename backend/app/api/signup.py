"""Signup with a Dart-emailed 6-digit code.

POST /auth/signup/code    {email}                  → emails a code (Brevo)
POST /auth/signup/verify  {email, code, password}  → creates the account

The Supabase account is created only after the code verifies (admin API,
pre-confirmed), so an unverified signup never exists as an account — there is
nothing to sign in to until the code is entered. Sign-in itself stays plain
email + password and never needs a code.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from .. import authcodes
from ..config import Settings
from ..errors import (
    CONFLICT,
    INTERNAL,
    INVALID_CODE,
    INVALID_INPUT,
    RATE_LIMITED,
    DartError,
)
from ..ratelimit import rate_limit

router = APIRouter()

_auth_rl = rate_limit(10, limit_attr="rate_limit_auth_per_min")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SendCodeIn(BaseModel):
    email: str


class VerifyIn(BaseModel):
    email: str
    code: str
    password: str


def _clean_email(raw: str) -> str:
    email = raw.strip().lower()
    if not _EMAIL_RE.fullmatch(email) or len(email) > 254:
        raise DartError(INVALID_INPUT, "Enter a valid email address.", status=400)
    return email


def _require_configured(settings: Settings) -> None:
    if not settings.supabase_url or not settings.supabase_service_key:
        raise DartError(INTERNAL, "Auth backend isn’t configured.", status=500)
    if not authcodes.email_ready(settings):
        raise DartError(
            INTERNAL, "Signup email service isn’t configured.", status=503
        )


def _parse_ts(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.post("/auth/signup/code", dependencies=[Depends(_auth_rl)])
async def send_signup_code(body: SendCodeIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    email = _clean_email(body.email)
    _require_configured(settings)

    if await authcodes.user_exists(settings, email):
        raise DartError(
            CONFLICT, "That email already has an account — sign in instead.", status=409
        )

    # Per-address cooldown on top of the per-IP rate limit.
    row = await authcodes.get_code_row(settings, email)
    if row:
        age = (datetime.now(timezone.utc) - _parse_ts(row["created_at"])).total_seconds()
        if age < authcodes.RESEND_COOLDOWN_SEC:
            raise DartError(
                RATE_LIMITED,
                "A code was just sent — wait a minute before resending.",
                status=429,
                retryable=True,
            )

    code = authcodes.gen_code()
    await authcodes.store_code(settings, email, authcodes.hash_code(settings, email, code))
    try:
        await authcodes.send_code_email(settings, email, code)
    except Exception as e:  # noqa: BLE001 — surface as a contract error
        raise DartError(
            INTERNAL, "Couldn’t send the code email — try again shortly.", status=502
        ) from e
    return {"sent": True}


@router.post("/auth/signup/verify", dependencies=[Depends(_auth_rl)])
async def verify_signup_code(body: VerifyIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    email = _clean_email(body.email)
    code = re.sub(r"\D", "", body.code or "")
    if len(code) != 6:
        raise DartError(INVALID_INPUT, "Enter the 6-digit code.", status=400)
    if len(body.password) < 8 or len(body.password) > 128:
        raise DartError(INVALID_INPUT, "Password must be 8–128 characters.", status=400)
    _require_configured(settings)

    row = await authcodes.get_code_row(settings, email)
    if not row:
        raise DartError(
            INVALID_CODE, "No code is pending for this email — request one.", status=400
        )
    if _parse_ts(row["expires_at"]) < datetime.now(timezone.utc):
        await authcodes.delete_code(settings, email)
        raise DartError(INVALID_CODE, "That code expired — request a new one.", status=400)
    if row["attempts"] >= authcodes.MAX_ATTEMPTS:
        await authcodes.delete_code(settings, email)
        raise DartError(
            RATE_LIMITED, "Too many wrong attempts — request a new code.", status=429
        )
    if authcodes.hash_code(settings, email, code) != row["code_hash"]:
        await authcodes.bump_attempts(settings, email, row["attempts"] + 1)
        raise DartError(
            INVALID_CODE, "That code didn’t match — check for typos.", status=400
        )

    result = await authcodes.create_confirmed_user(settings, email, body.password)
    await authcodes.delete_code(settings, email)
    if result == "exists":
        raise DartError(
            CONFLICT, "That email already has an account — sign in instead.", status=409
        )
    return {"created": True}
