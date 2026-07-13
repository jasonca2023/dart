"""Signed-in account management.

POST /auth/password        {token, current_password, new_password} → change password
POST /auth/delete-account  {token, password}                       → delete account + data

Both require the session token AND a fresh password confirmation (GoTrue
password grant), so an unattended open tab can't silently change or destroy an
account. Deletion removes the library rows and stored files first, then the
account itself — a failure partway leaves the account intact and retryable.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from .. import authcodes
from ..config import Settings
from ..errors import INTERNAL, INVALID_INPUT, UNAUTHORIZED, DartError
from ..ratelimit import rate_limit

router = APIRouter()

_account_rl = rate_limit(10, limit_attr="rate_limit_auth_per_min")


class PasswordIn(BaseModel):
    token: str
    current_password: str
    new_password: str


class DeleteIn(BaseModel):
    token: str
    password: str


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


@router.post("/auth/delete-account", dependencies=[Depends(_account_rl)])
async def delete_account(body: DeleteIn, request: Request) -> dict:
    settings: Settings = request.app.state.settings
    _require_configured(settings)

    uid, _ = await _confirmed_user(settings, body.token, body.password)
    await authcodes.delete_user_data(settings, uid)
    await authcodes.delete_user(settings, uid)
    return {"deleted": True}
