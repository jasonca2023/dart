"""FastAPI application factory and entrypoint.

Run: uvicorn app.main:app --reload  (from the backend/ directory)
"""

from __future__ import annotations

import ipaddress
import logging
import socket

from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .api.jobs import router as jobs_router
from .api.settings import router as settings_router
from .auth import verify_token
from .config import Settings, get_settings, media_root
from .errors import (
    INVALID_URL,
    SCRAPE_FAILED,
    UNAUTHORIZED,
    DartError,
    dart_error_handler,
)
from .pipeline import Orchestrator
from .providers.factory import build_providers
from .store import JobStore


def _is_public_host(host: str | None) -> bool:
    """True only when every address `host` resolves to is a public IP — blocks
    SSRF to loopback/link-local/private/reserved ranges (e.g. cloud metadata at
    169.254.169.254) via the image proxy.
    """
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        try:
            addr = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_multicast
            or addr.is_unspecified
        ):
            return False
    return True


async def _ssrf_safe_get(url: str, *, max_redirects: int = 5):
    """GET `url`, following redirects manually and re-validating every hop's host
    against private/loopback/link-local ranges (SSRF guard). Raises DartError on a
    disallowed host, a bad scheme, or too many redirects.
    """
    import httpx

    async with httpx.AsyncClient(
        timeout=20.0, follow_redirects=False, headers={"User-Agent": "Mozilla/5.0"}
    ) as client:
        current = url
        for _ in range(max_redirects):
            p = urlparse(current)
            if p.scheme not in ("http", "https") or not p.netloc:
                raise DartError(INVALID_URL, "Bad url.", status=400)
            if not _is_public_host(p.hostname):
                raise DartError(INVALID_URL, "Host is not allowed.", status=400)
            r = await client.get(current)
            if r.is_redirect and "location" in r.headers:
                current = str(httpx.URL(current).join(r.headers["location"]))
                continue
            return r
        raise DartError(SCRAPE_FAILED, "Too many redirects.", status=502)


async def _fetch_store_logo(origin: str) -> str | None:
    """Best-effort: scrape the store homepage for its highest-resolution brand mark
    (apple-touch-icon / icon link). Returns an absolute URL, or None. Free — just an
    HTTP fetch + a regex over the <link> tags.
    """
    import re

    import httpx

    try:
        r = await _ssrf_safe_get(origin)
        r.raise_for_status()
        html = r.text[:1_000_000]
    except Exception:
        return None

    best: tuple[int, str] | None = None  # (size, href)
    for m in re.finditer(r"<link\b[^>]*>", html, re.IGNORECASE):
        tag = m.group(0)
        rel = re.search(r'rel=["\']([^"\']+)["\']', tag, re.IGNORECASE)
        href = re.search(r'href=["\']([^"\']+)["\']', tag, re.IGNORECASE)
        if not rel or not href or "icon" not in rel.group(1).lower():
            continue
        sz = re.search(r'sizes=["\']?(\d+)', tag, re.IGNORECASE)
        # apple-touch-icon is usually a clean 180px brand mark; weight it high.
        size = int(sz.group(1)) if sz else (180 if "apple-touch-icon" in rel.group(1).lower() else 32)
        if best is None or size > best[0]:
            best = (size, href.group(1))
    if not best:
        return None
    try:
        return str(httpx.URL(origin).join(best[1]))
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
        try:
            r = await _ssrf_safe_get(url)
            r.raise_for_status()
        except DartError:
            raise
        except Exception as e:
            raise DartError(SCRAPE_FAILED, "Could not fetch image.", status=502) from e
        media_type = r.headers.get("content-type", "image/jpeg")
        if not media_type.startswith("image/"):
            raise DartError(SCRAPE_FAILED, "URL is not an image.", status=400)
        return Response(content=r.content, media_type=media_type)

    @app.get("/store-products")
    async def store_products(url: str = Query(...)) -> dict:
        # Pull a store's PUBLIC Shopify products feed (`/products.json`) so a merchant
        # can batch-generate ads for their whole catalogue — no app, no OAuth, no key.
        # SSRF-guarded like the image proxy.
        parsed = urlparse(url if "://" in url else f"https://{url}")
        if not parsed.netloc:
            raise DartError(INVALID_URL, "Enter your store URL.", status=400)
        feed = f"https://{parsed.netloc}/products.json?limit=100"
        try:
            r = await _ssrf_safe_get(feed)
            r.raise_for_status()
            data = r.json()
        except DartError:
            raise
        except Exception as e:
            raise DartError(
                SCRAPE_FAILED,
                "Couldn't read that store — it needs a public Shopify products feed.",
                status=502,
            ) from e

        out: list[dict] = []
        for p in (data.get("products") or [])[:100]:
            images = p.get("images") or []
            variants = p.get("variants") or []
            image = images[0].get("src") if images and isinstance(images[0], dict) else None
            price = variants[0].get("price") if variants and isinstance(variants[0], dict) else None
            title = p.get("title")
            if title and image:
                out.append(
                    {
                        "title": str(title),
                        "image": str(image),
                        "price": f"${price}" if price else "",
                    }
                )
        logo = await _fetch_store_logo(f"https://{parsed.netloc}")
        return {"products": out, "logo": logo}

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
        user_id = await verify_token(
            settings.supabase_url, settings.supabase_service_key, token
        )
        if not user_id:
            raise DartError(
                UNAUTHORIZED, "Invalid or expired session token.", status=401
            )

        # The id is a client-generated UUID, but never trust it: it flows into
        # Storage object keys and the row id. Strip to UUID-safe chars so it can't
        # carry "/" or ".." into a path (a legit UUID is unchanged).
        safe_id = "".join(c for c in id if c.isalnum() or c in "-_") or "ad"

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
                img_path = f"{user_id}/img-{safe_id}.{ext}"
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
            vid_path = f"{user_id}/{safe_id}.{vid_ext}"
            r = await client.post(
                f"{base}/storage/v1/object/{VIDEO_BUCKET}/{vid_path}",
                headers={**auth, "x-upsert": "true", "Content-Type": vid_type},
                content=vid_bytes,
            )
            if r.status_code >= 300:
                raise DartError(SCRAPE_FAILED, f"Video upload failed: {r.text}", status=502)
            video_url = public_url(vid_path)

            row = {
                "id": safe_id,
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
