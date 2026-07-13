"""Signed-in account management.

POST /auth/overview        {token}                                 → account stats
POST /auth/password        {token, current_password, new_password} → change password
POST /auth/email/code      {token, password, new_email}            → code to the new email
POST /auth/email/verify    {token, new_email, code, request}       → switch the email
POST /auth/delete-account  {token, password}                       → delete account + data

The mutating flows require the session token AND a fresh password confirmation
(GoTrue password grant), so an unattended open tab can't silently change or
destroy an account. Email change additionally proves the NEW address with an
emailed 6-digit code (same machinery as signup/reset). Deletion removes the
library rows and stored files first, then the account itself — a failure
partway leaves the account intact and retryable.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from .. import authcodes
from ..config import Settings
from ..errors import CONFLICT, INTERNAL, INVALID_INPUT, UNAUTHORIZED, DartError
from ..ratelimit import rate_limit

# The emailed-code machinery lives with the signup/reset flows.
from .signup import (
    _check_code,
    _clean_code,
    _clean_email,
    _consume_code,
    _issue_code,
    _require_configured as _require_email_ready,
)

router = APIRouter()

_account_rl = rate_limit(10, limit_attr="rate_limit_auth_per_min")


class TokenIn(BaseModel):
    token: str


class PasswordIn(BaseModel):
    token: str
    current_password: str
    new_password: str


class DeleteIn(BaseModel):
    token: str
    password: str


class EmailCodeIn(BaseModel):
    token: str
    password: str
    new_email: str


class EmailVerifyIn(BaseModel):
    token: str
    new_email: str
    code: str
    request: str = ""


def _require_configured(settings: Settings) -> None:
    if not settings.supabase_url or not settings.supabase_service_key:
        raise DartError(INTERNAL, "Auth backend isn’t configured.", status=500)


async def _confirmed_user(
    settings: Settings, token: str, password: str
) -> tuple[str, str]:
    """Resolve the session token and re-confirm the password → (id, email)."""
    user = await authcodes.get_token_user(settings, token)
    if not user:
        raise DartError(UNAUTHORIZED, "Invalid or expired session.", status=401)
    uid, email = user
    if not await authcodes.check_password(settings, email, password):
        raise DartError(INVALID_INPUT, "That password is wrong.", status=400)
    return uid, email


@router.post("/auth/overview", dependencies=[Depends(_account_rl)])
async def account_overview(body: TokenIn, request: Request) -> dict:
    """Read-only stats for the account page (the ads count is client-side —
    the rows are user-readable via RLS; storage sizes are not)."""
    settings: Settings = request.app.state.settings
    _require_configured(settings)
    user = await authcodes.get_token_user(settings, body.token)
    if not user:
        raise DartError(UNAUTHORIZED, "Invalid or expired session.", status=401)
    uid, _ = user
    return {"storage_bytes": await authcodes.storage_usage(settings, uid)}


@router.post("/auth/password", dependencies=[Depends(_account_rl)])
async def change_password(body: PasswordIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    if len(body.new_password) < 8 or len(body.new_password) > 128:
        raise DartError(INVALID_INPUT, "Password must be 8–128 characters.", status=400)
    _require_configured(settings)

    uid, _ = await _confirmed_user(settings, body.token, body.current_password)
    # A policy-rejected password surfaces as 400 with GoTrue's message.
    await authcodes.set_user_password(settings, uid, body.new_password)
    return {"updated": True}


@router.post("/auth/email/code", dependencies=[Depends(_account_rl)])
async def send_email_change_code(body: EmailCodeIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    new_email = _clean_email(body.new_email)
    _require_email_ready(settings)

    _, old_email = await _confirmed_user(settings, body.token, body.password)
    if new_email == old_email.lower():
        raise DartError(INVALID_INPUT, "That is already your email.", status=400)
    if await authcodes.user_exists(settings, new_email):
        raise DartError(
            CONFLICT, "That email already has an account.", status=409
        )
    req = await _issue_code(settings, new_email, "email")
    return {"sent": True, "request": req}


@router.post("/auth/email/verify", dependencies=[Depends(_account_rl)])
async def verify_email_change(body: EmailVerifyIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    new_email = _clean_email(body.new_email)
    code = _clean_code(body.code)
    _require_email_ready(settings)

    user = await authcodes.get_token_user(settings, body.token)
    if not user:
        raise DartError(UNAUTHORIZED, "Invalid or expired session.", status=401)
    uid, _ = user
    await _check_code(settings, new_email, code, "email", body.request)
    result = await authcodes.set_user_email(settings, uid, new_email)
    await _consume_code(settings, new_email)
    if result == "exists":
        raise DartError(CONFLICT, "That email already has an account.", status=409)
    return {"updated": True}


@router.post("/auth/delete-account", dependencies=[Depends(_account_rl)])
async def delete_account(body: DeleteIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    _require_configured(settings)

    uid, _ = await _confirmed_user(settings, body.token, body.password)
    await authcodes.delete_user_data(settings, uid)
    await authcodes.delete_user(settings, uid)
    return {"deleted": True}
