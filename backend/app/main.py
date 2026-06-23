"""FastAPI application factory and entrypoint.

Run: uvicorn app.main:app --reload  (from the backend/ directory)
"""

from __future__ import annotations

import base64
import json
import logging
import uuid

from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .api.jobs import router as jobs_router
from .api.settings import router as settings_router
from .config import Settings, get_settings, media_root
from .errors import INVALID_URL, SCRAPE_FAILED, DartError, dart_error_handler
from .pipeline import Orchestrator
from .providers.factory import build_providers
from .store import JobStore


def _jwt_sub(token: str) -> str | None:
    """Extract the `sub` (user id) from a JWT payload without verifying it.

    The token comes from the caller's own logged-in Supabase session; we only
    use its `sub` to scope the upload to that user's folder.
    """
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
        sub = data.get("sub")
        uuid.UUID(str(sub))  # validate shape
        return str(sub)
    except Exception:
        return None


VIDEO_BUCKET = "dart-videos"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=logging.INFO)

    app = FastAPI(title="Dart Backend", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    store = JobStore()
    scraper, scripter, video = build_providers(settings)

    app.state.settings = settings
    app.state.store = store
    app.state.orchestrator = Orchestrator(store, scraper, scripter, video)

    app.add_exception_handler(DartError, dart_error_handler)
    app.include_router(jobs_router)
    app.include_router(settings_router)

    # Serve generated videos (LTX writes mp4s here) at /media/<file>.mp4.
    media = media_root()
    media.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=str(media)), name="media")

    @app.get("/proxy-image")
    async def proxy_image(url: str = Query(...)) -> Response:
        # Re-serves an external product image same-origin (with CORS) so the
        # browser can draw it into the Remotion canvas without tainting it.
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise DartError(INVALID_URL, "Bad image url.", status=400)
        try:
            import httpx

            async with httpx.AsyncClient(
                timeout=20.0, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}
            ) as client:
                r = await client.get(url)
                r.raise_for_status()
        except Exception as e:
            raise DartError(SCRAPE_FAILED, "Could not fetch image.", status=502) from e
        media_type = r.headers.get("content-type", "image/jpeg")
        if not media_type.startswith("image/"):
            raise DartError(SCRAPE_FAILED, "URL is not an image.", status=400)
        return Response(content=r.content, media_type=media_type)

    @app.post("/save-ad")
    async def save_ad(
        video: UploadFile = File(...),
        token: str = Form(...),
        id: str = Form(...),
        product_title: str = Form(""),
        target_audience: str = Form(""),
        aspect_ratio: str = Form("16:9"),
        duration_sec: int = Form(10),
        resolution: str = Form("1080p"),
        cost_cents: int = Form(0),
        image: UploadFile | None = File(None),
    ) -> dict:
        # Persist a browser-rendered ad using the service-role key (bypasses
        # Storage RLS), scoped to the user id carried by their session token.
        if not settings.supabase_url or not settings.supabase_service_key:
            raise DartError(
                SCRAPE_FAILED, "Server is missing Supabase service config.", status=500
            )
        user_id = _jwt_sub(token)
        if not user_id:
            raise DartError(INVALID_URL, "Invalid or missing session token.", status=401)

        base = settings.supabase_url.rstrip("/")
        key = settings.supabase_service_key
        auth = {"Authorization": f"Bearer {key}", "apikey": key}

        import httpx

        def public_url(path: str) -> str:
            return f"{base}/storage/v1/object/public/{VIDEO_BUCKET}/{path}"

        async with httpx.AsyncClient(timeout=120.0) as client:
            image_url: str | None = None
            if image is not None:
                img_bytes = await image.read()
                ext = (image.filename or "img.png").rsplit(".", 1)[-1].lower()
                ext = "".join(c for c in ext if c.isalnum()) or "png"
                img_path = f"{user_id}/img-{id}.{ext}"
                r = await client.post(
                    f"{base}/storage/v1/object/{VIDEO_BUCKET}/{img_path}",
                    headers={
                        **auth,
                        "x-upsert": "true",
                        "Content-Type": image.content_type or "image/png",
                    },
                    content=img_bytes,
                )
                if r.status_code >= 300:
                    raise DartError(SCRAPE_FAILED, f"Image upload failed: {r.text}", status=502)
                image_url = public_url(img_path)

            vid_bytes = await video.read()
            vid_type = video.content_type or "video/mp4"
            vid_ext = "webm" if "webm" in vid_type else "mp4"
            vid_path = f"{user_id}/{id}.{vid_ext}"
            r = await client.post(
                f"{base}/storage/v1/object/{VIDEO_BUCKET}/{vid_path}",
                headers={**auth, "x-upsert": "true", "Content-Type": vid_type},
                content=vid_bytes,
            )
            if r.status_code >= 300:
                raise DartError(SCRAPE_FAILED, f"Video upload failed: {r.text}", status=502)
            video_url = public_url(vid_path)

            row = {
                "id": id,
                "user_id": user_id,
                "product_url": "",
                "target_audience": target_audience or None,
                "product_title": product_title or None,
                "product_image": image_url,
                "video_url": video_url,
                "aspect_ratio": aspect_ratio,
                "duration_sec": duration_sec,
                "resolution": resolution,
                "status": "ready",
                "cost_cents": cost_cents,
            }
            r = await client.post(
                f"{base}/rest/v1/dart_ads",
                headers={
                    **auth,
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates",
                },
                json=row,
            )
            if r.status_code >= 300:
                raise DartError(SCRAPE_FAILED, f"Saving the ad failed: {r.text}", status=502)

        return {"video_url": video_url, "image_url": image_url}

    @app.get("/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "save_ad_ready": bool(settings.supabase_url and settings.supabase_service_key),
            "providers": {
                "scraper": type(scraper).__name__,
                "script": type(scripter).__name__,
                "video": type(video).__name__,
            },
        }

    return app


app = create_app()
