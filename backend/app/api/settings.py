"""Runtime settings — lets the operator paste an LTX API key from the UI instead
of editing .env. The key is held server-side (in-memory) and never returned to the
browser. Single global key (fine for the single-tenant/demo deployment).

These routes mutate GLOBAL provider config (the key and provider selection every
user's jobs run on), so a normal user login is not authorization enough: both
routes require the operator's SETTINGS_ADMIN_KEY, and are disabled outright when
it isn't configured.
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel

from ..errors import NOT_FOUND, UNAUTHORIZED, DartError
from ..providers.factory import build_video_generator

router = APIRouter()


class LtxKeyRequest(BaseModel):
    api_key: str


def _require_admin(request: Request, admin_key: str | None) -> None:
    configured = request.app.state.settings.settings_admin_key
    if not configured:
        # No operator key configured → the runtime-settings surface doesn't
        # exist. 404 (not 403) so probes can't distinguish "disabled" from
        # "absent".
        raise DartError(NOT_FOUND, "Not found.", status=404)
    if not admin_key or not hmac.compare_digest(admin_key, configured):
        raise DartError(UNAUTHORIZED, "Invalid admin key.", status=401)


def _status(request: Request) -> dict:
    s = request.app.state.settings
    video = request.app.state.orchestrator.video
    return {
        "video_provider": s.video_provider,
        "video_generator": type(video).__name__,
        "ltx_key_set": bool(s.ltx_api_key),
    }


@router.get("/settings")
async def get_settings_status(
    request: Request, x_admin_key: str | None = Header(default=None)
) -> dict:
    _require_admin(request, x_admin_key)
    return _status(request)


@router.post("/settings/ltx-key")
async def set_ltx_key(
    body: LtxKeyRequest,
    request: Request,
    x_admin_key: str | None = Header(default=None),
) -> dict:
    _require_admin(request, x_admin_key)
    s = request.app.state.settings
    key = body.api_key.strip()
    s.ltx_api_key = key or None
    if key:
        s.video_provider = "ltx"
    # Rebuild the video generator so subsequent jobs use the new key.
    request.app.state.orchestrator.video = build_video_generator(s)
    return {"ok": True, **_status(request)}
