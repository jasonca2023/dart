"""Runtime settings — lets the operator paste an LTX API key from the UI instead
of editing .env. The key is held server-side (in-memory) and never returned to the
browser. Single global key (fine for the single-tenant/demo deployment)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..auth import require_user
from ..providers.factory import build_video_generator

router = APIRouter()


class LtxKeyRequest(BaseModel):
    api_key: str


def _status(request: Request) -> dict:
    s = request.app.state.settings
    video = request.app.state.orchestrator.video
    return {
        "video_provider": s.video_provider,
        "video_generator": type(video).__name__,
        "ltx_key_set": bool(s.ltx_api_key),
    }


@router.get("/settings")
async def get_settings_status(request: Request) -> dict:
    return _status(request)


@router.post("/settings/ltx-key")
async def set_ltx_key(
    body: LtxKeyRequest, request: Request, user: str = Depends(require_user)
) -> dict:
    s = request.app.state.settings
    key = body.api_key.strip()
    s.ltx_api_key = key or None
    if key:
        s.video_provider = "ltx"
    # Rebuild the video generator so subsequent jobs use the new key.
    request.app.state.orchestrator.video = build_video_generator(s)
    return {"ok": True, **_status(request)}
