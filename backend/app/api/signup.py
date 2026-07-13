"""Signup and password reset with a Dart-emailed 6-digit code.

POST /auth/signup/code    {email}                  → emails a signup code (Brevo)
POST /auth/signup/verify  {email, code, password}  → creates the account
POST /auth/reset/code     {email}                  → emails a password-reset code
POST /auth/reset/check    {email, code}            → validates the code (not consumed)
POST /auth/reset/verify   {email, code, password}  → sets the new password

The Supabase account is created only after the signup code verifies (admin API,
pre-confirmed), so an unverified signup never exists as an account — there is
nothing to sign in to until the code is entered. Password reset mirrors the
flow for accounts that do exist. Sign-in itself stays plain email + password
and never needs a code. Codes are purpose-scoped: a signup code can never
verify as a reset code, or vice versa. /code returns an opaque request token;
guesses without it are rejected before the attempt counter, so third parties
can't burn the owner's cap.
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
    NOT_FOUND,
    RATE_LIMITED,
    DartError,
)
from ..ratelimit import rate_limit

router = APIRouter()

_auth_rl = rate_limit(10, limit_attr="rate_limit_auth_per_min")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SendCodeIn(BaseModel):
    email: str


class CheckIn(BaseModel):
    email: str
    code: str
    request: str = ""


class VerifyIn(BaseModel):
    email: str
    code: str
    password: str
    request: str = ""


def _clean_email(raw: str) -> str:
    email = raw.strip().lower()
    if not _EMAIL_RE.fullmatch(email) or len(email) > 254:
        raise DartError(INVALID_INPUT, "Enter a valid email address.", status=400)
    return email


def _clean_code(raw: str) -> str:
    code = re.sub(r"\D", "", raw or "")
    if len(code) != 6:
        raise DartError(INVALID_INPUT, "Enter the 6-digit code.", status=400)
    return code


def _check_password_shape(password: str) -> None:
    if len(password) < 8 or len(password) > 128:
        raise DartError(INVALID_INPUT, "Password must be 8–128 characters.", status=400)


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


async def _issue_code(settings: Settings, email: str, purpose: str) -> str:
    """Cooldown-check, generate, store and email a code for `purpose`.

    Returns the request token the browser must echo back on check/verify."""
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
    request = authcodes.gen_request()
    await authcodes.store_code(
        settings,
        email,
        authcodes.hash_code(settings, email, code, purpose),
        authcodes.hash_request(settings, email, request),
    )
    try:
        await authcodes.send_code_email(settings, email, code, purpose)
    except Exception as e:  # noqa: BLE001 — surface as a contract error
        raise DartError(
            INTERNAL, "Couldn’t send the code email — try again shortly.", status=502
        ) from e
    return request


async def _check_code(
    settings: Settings, email: str, code: str, purpose: str, request: str
) -> None:
    """Validate a submitted code for `purpose`; raises unless it matches."""
    row = await authcodes.get_code_row(settings, email)
    if not row:
        raise DartError(
            INVALID_CODE, "No code is pending for this email — request one.", status=400
        )
    # The request token proves this browser asked for the code. Without it the
    # guess is rejected before it can touch the attempt counter, so third
    # parties can't burn the owner's cap.
    if authcodes.hash_request(settings, email, request) != row["request_hash"]:
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
    if authcodes.hash_code(settings, email, code, purpose) != row["code_hash"]:
        await authcodes.bump_attempts(settings, email, row["attempts"] + 1)
        raise DartError(
            INVALID_CODE, "That code didn’t match — check for typos.", status=400
        )


async def _consume_code(settings: Settings, email: str) -> None:
    # Best-effort: the action already succeeded; a leftover row just expires.
    try:
        await authcodes.delete_code(settings, email)
    except Exception:  # noqa: BLE001
        pass


@router.post("/auth/signup/code", dependencies=[Depends(_auth_rl)])
async def send_signup_code(body: SendCodeIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    email = _clean_email(body.email)
    _require_configured(settings)

    if await authcodes.user_exists(settings, email):
        raise DartError(
            CONFLICT, "That email already has an account — sign in instead.", status=409
        )
    request = await _issue_code(settings, email, "signup")
    return {"sent": True, "request": request}


@router.post("/auth/signup/verify", dependencies=[Depends(_auth_rl)])
async def verify_signup_code(body: VerifyIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    email = _clean_email(body.email)
    code = _clean_code(body.code)
    _check_password_shape(body.password)
    _require_configured(settings)

    await _check_code(settings, email, code, "signup", body.request)
    # If GoTrue rejects the password (policy), this raises 400 and the code row
    # survives, so the user can retry with a better password on the same code.
    result = await authcodes.create_confirmed_user(settings, email, body.password)
    await _consume_code(settings, email)
    if result == "exists":
        raise DartError(
            CONFLICT, "That email already has an account — sign in instead.", status=409
        )
    return {"created": True}


@router.post("/auth/reset/code", dependencies=[Depends(_auth_rl)])
async def send_reset_code(body: SendCodeIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    email = _clean_email(body.email)
    _require_configured(settings)

    # Signup already discloses which emails have accounts (409 above), so a
    # plain 404 here costs nothing extra and gives honest UX.
    if not await authcodes.user_exists(settings, email):
        raise DartError(
            NOT_FOUND, "No account with this email — create one instead.", status=404
        )
    request = await _issue_code(settings, email, "reset")
    return {"sent": True, "request": request}


@router.post("/auth/reset/check", dependencies=[Depends(_auth_rl)])
async def check_reset_code(body: CheckIn, request: Request) -> dict:
    """Validate the code before the UI asks for a new password. The code is
    not consumed — /verify re-checks it — and wrong guesses still count
    against MAX_ATTEMPTS, so this is no better an oracle than /verify."""
    settings: Settings = request.app.state.settings
    email = _clean_email(body.email)
    code = _clean_code(body.code)
    _require_configured(settings)

    await _check_code(settings, email, code, "reset", body.request)
    return {"valid": True}


@router.post("/auth/reset/verify", dependencies=[Depends(_auth_rl)])
async def verify_reset_code(body: VerifyIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    email = _clean_email(body.email)
    code = _clean_code(body.code)
    _check_password_shape(body.password)
    _require_configured(settings)

    await _check_code(settings, email, code, "reset", body.request)
    user_id = await authcodes.user_id_by_email(settings, email)
    if not user_id:
        # Account deleted between code and verify.
        raise DartError(
            NOT_FOUND, "No account with this email — create one instead.", status=404
        )
    # A policy-rejected password raises 400 here and keeps the code row.
    await authcodes.set_user_password(settings, user_id, body.password)
    await _consume_code(settings, email)
    return {"reset": True}
