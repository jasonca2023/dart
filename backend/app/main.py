"""FastAPI application factory and entrypoint.

Run: uvicorn app.main:app --reload  (from the backend/ directory)
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
import tempfile

from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, Form, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .api.jobs import router as jobs_router
from .api.settings import router as settings_router
from .api.account import router as account_router
from .api.signup import router as signup_router
from .authcodes import email_ready as authcodes_email_ready
from .auth import verify_token
from .config import Settings, get_settings, media_root
from .errors import (
    INVALID_INPUT,
    INVALID_URL,
    SCRAPE_FAILED,
    UNAUTHORIZED,
    DartError,
    dart_error_handler,
)
from .monitoring import init_sentry
from .netguard import is_public_host, ssrf_safe_get
from .pipeline import Orchestrator
from .providers.factory import build_providers
from .ratelimit import rate_limit
from .store import JobStore

# Back-compat aliases (the guard moved to netguard so the scraper shares it).
_is_public_host = is_public_host
_ssrf_safe_get = ssrf_safe_get

log = logging.getLogger("dart.main")


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


async def _fetch_shopify_product(netloc: str, handle: str) -> dict | None:
    """A Shopify product page also exposes `/products/<handle>.json` — fetch just
    that product, so pasting a product link imports one product, not the catalogue.
    Returns {title, image, price} or None.
    """
    try:
        r = await _ssrf_safe_get(f"https://{netloc}/products/{handle}.json")
        r.raise_for_status()
        p = r.json().get("product") or {}
    except Exception:
        return None
    images = p.get("images") or []
    variants = p.get("variants") or []
    image = images[0].get("src") if images and isinstance(images[0], dict) else None
    price = variants[0].get("price") if variants and isinstance(variants[0], dict) else None
    title = p.get("title")
    if title and image:
        return {"title": str(title), "image": str(image), "price": f"${price}" if price else ""}
    return None


async def _fetch_product_page(url: str) -> dict | None:
    """Best-effort: read a single product page (any platform) via the structured
    data most stores embed for search engines — JSON-LD Product first, OpenGraph
    product tags second. Returns {title, image, price} or None. Free — an HTTP
    fetch + parsing, no APIs.
    """
    import html as html_lib
    import json
    import re

    import httpx

    try:
        r = await _ssrf_safe_get(url)
        r.raise_for_status()
        page = r.text[:1_500_000]
    except Exception:
        return None

    def absolute(img: str | None) -> str | None:
        if not img:
            return None
        try:
            return str(httpx.URL(url).join(img))
        except Exception:
            return None

    def from_json_ld() -> dict | None:
        for m in re.finditer(
            r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            page,
            re.IGNORECASE | re.DOTALL,
        ):
            try:
                data = json.loads(m.group(1).strip())
            except Exception:
                continue
            nodes = data if isinstance(data, list) else [data]
            graph: list[dict] = []
            for n in nodes:
                if isinstance(n, dict):
                    graph.append(n)
                    more = n.get("@graph")
                    if isinstance(more, list):
                        graph.extend(x for x in more if isinstance(x, dict))
            for node in graph:
                types = node.get("@type")
                types = types if isinstance(types, list) else [types]
                if "Product" not in [str(t) for t in types]:
                    continue
                title = node.get("name")
                image = node.get("image")
                if isinstance(image, list):
                    image = image[0] if image else None
                if isinstance(image, dict):
                    image = image.get("url")
                offers = node.get("offers") or {}
                if isinstance(offers, list):
                    offers = next((o for o in offers if isinstance(o, dict)), {})
                if not isinstance(offers, dict):
                    offers = {}
                price = offers.get("price") or offers.get("lowPrice")
                image_url = absolute(str(image)) if image else None
                if title and image_url:
                    return {
                        "title": html_lib.unescape(str(title)).strip(),
                        "image": image_url,
                        "price": f"${price}" if price else "",
                    }
        return None

    def from_open_graph() -> dict | None:
        og: dict[str, str] = {}
        for m in re.finditer(r"<meta\b[^>]*>", page, re.IGNORECASE):
            tag = m.group(0)
            k = re.search(r'(?:property|name)=["\']([^"\']+)["\']', tag, re.IGNORECASE)
            v = re.search(r'content=["\']([^"\']*)["\']', tag, re.IGNORECASE)
            if k and v:
                og.setdefault(k.group(1).lower(), v.group(1))
        # Only trust OpenGraph when the page declares itself a product — otherwise a
        # homepage's og:title/og:image would import as a junk "product".
        if "product" not in og.get("og:type", ""):
            return None
        title = og.get("og:title")
        image = absolute(og.get("og:image"))
        price = og.get("product:price:amount") or og.get("og:price:amount")
        if title and image:
            return {
                "title": html_lib.unescape(title).strip(),
                "image": image,
                "price": f"${price}" if price else "",
            }
        return None

    return from_json_ld() or from_open_graph()


VIDEO_BUCKET = "dart-videos"


_VISUAL_SAMPLE_ENTRY_TYPES = {b"avc1", b"avc3", b"hev1", b"hvc1", b"av01", b"vp08", b"vp09", b"mp4v"}


def _iter_boxes(data: bytes, start: int, end: int):
    """Yield (type, box_start, payload_start, box_end) for each ISO-BMFF box in
    data[start:end], following each box's own declared size field (handling the
    size==0 "to EOF" and size==1 64-bit largesize cases) rather than scanning for
    byte patterns."""
    pos = start
    while pos + 8 <= end:
        size = int.from_bytes(data[pos : pos + 4], "big")
        btype = data[pos + 4 : pos + 8]
        header_len = 8
        if size == 1:
            if pos + 16 > end:
                return
            size = int.from_bytes(data[pos + 8 : pos + 16], "big")
            header_len = 16
        elif size == 0:
            size = end - pos
        if size < header_len or pos + size > end:
            return
        yield btype, pos, pos + header_len, pos + size
        pos += size


def _find_box(data: bytes, start: int, end: int, box_type: bytes):
    for btype, box_start, payload_start, box_end in _iter_boxes(data, start, end):
        if btype == box_type:
            return box_start, payload_start, box_end
    return None


def _mp4_transfer_characteristic(data: bytes) -> int | None:
    """Read the transfer tag from an mp4's `colr` (nclx/nclc) box inside
    moov > trak > mdia > minf > stbl > stsd > <video sample entry>, or None.

    Walks the real box tree via each box's declared size, rather than searching
    for the byte sequence "colr" anywhere in the file: a non-faststarted mp4
    (mdat — raw H.264 sample data — written before moov, common for
    browser-side muxers) can coincidentally contain those bytes inside encoded
    video data, which a blind substring search would misread as a real tag.
    """
    moov = _find_box(data, 0, len(data), b"moov")
    if moov is None:
        return None
    _, moov_payload, moov_end = moov
    for ttype, _, tpayload, tend in _iter_boxes(data, moov_payload, moov_end):
        if ttype != b"trak":
            continue
        mdia = _find_box(data, tpayload, tend, b"mdia")
        if mdia is None:
            continue
        minf = _find_box(data, mdia[1], mdia[2], b"minf")
        if minf is None:
            continue
        stbl = _find_box(data, minf[1], minf[2], b"stbl")
        if stbl is None:
            continue
        stsd = _find_box(data, stbl[1], stbl[2], b"stsd")
        if stsd is None:
            continue
        _, stsd_payload, stsd_end = stsd
        entries_start = stsd_payload + 8  # FullBox header(4) + entry_count(4)
        if entries_start > stsd_end:
            continue
        for etype, ebox_start, _, ebox_end in _iter_boxes(data, entries_start, stsd_end):
            if etype not in _VISUAL_SAMPLE_ENTRY_TYPES:
                continue
            # box header(8) + SampleEntry fields(8) + VisualSampleEntry fields(70)
            children_start = ebox_start + 86
            colr = _find_box(data, children_start, ebox_end, b"colr")
            if colr is None:
                continue
            _, colr_payload, colr_end = colr
            if data[colr_payload : colr_payload + 4] not in (b"nclx", b"nclc"):
                continue
            if colr_payload + 8 > colr_end:
                continue
            try:
                return int.from_bytes(data[colr_payload + 6 : colr_payload + 8], "big")
            except Exception:
                return None
    return None


def _retag_bt709(data: bytes) -> bytes:
    """Safari's WebCodecs exports tag the video with sRGB transfer (13), which
    many players render darker than Chrome's BT.709. Relabel it to BT.709
    *losslessly* — a stream copy that only rewrites the colour tags (container +
    H.264 SPS), no re-encode. Only touches mp4s that are actually tagged 13;
    best-effort, so any problem (no ffmpeg, odd input) returns the original bytes.
    """
    if _mp4_transfer_characteristic(data) != 13:
        return data
    if not shutil.which("ffmpeg"):
        return data
    try:
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "in.mp4")
            dst = os.path.join(d, "out.mp4")
            with open(src, "wb") as f:
                f.write(data)
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", src, "-c", "copy",
                    "-bsf:v",
                    "h264_metadata=transfer_characteristics=1:colour_primaries=1"
                    ":matrix_coefficients=1:video_full_range_flag=1",
                    "-color_primaries", "bt709", "-color_trc", "bt709",
                    "-colorspace", "bt709", "-color_range", "pc",
                    "-movflags", "+faststart", dst,
                ],
                check=True,
                capture_output=True,
                timeout=60,
            )
            out = open(dst, "rb").read()
            return out or data
    except Exception:
        return data

# Upload/proxy caps — a browser render tops out well under these; anything
# bigger is hostile or a mistake, and the whole body is held in memory.
MAX_PROXY_IMAGE_BYTES = 25 * 1024 * 1024
MAX_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_VIDEO_UPLOAD_BYTES = 300 * 1024 * 1024


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=logging.INFO)

    # Before the app is built so Sentry's FastAPI/ASGI integration wraps it.
    # No-op unless SENTRY_DSN is configured.
    init_sentry(settings)

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
    app.include_router(signup_router)
    app.include_router(account_router)

    # Serve generated videos (LTX writes mp4s here) at /media/<file>.mp4.
    media = media_root()
    media.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=str(media)), name="media")

    # Per-IP rate limits for the public endpoints — the open image/scrape proxies
    # and the (authenticated) save path — so they can't be used to burn bandwidth
    # or hammer Storage. Limits are configurable per settings.
    proxy_rl = rate_limit(120, limit_attr="rate_limit_proxy_per_min")
    store_rl = rate_limit(30, limit_attr="rate_limit_store_per_min")
    save_rl = rate_limit(60, limit_attr="rate_limit_save_per_min")

    @app.get("/proxy-image", dependencies=[Depends(proxy_rl)])
    async def proxy_image(url: str = Query(...)) -> Response:
        # Re-serves an external product image same-origin (with CORS) so the
        # browser can draw it into the Remotion canvas without tainting it.
        try:
            r = await ssrf_safe_get(url, max_bytes=MAX_PROXY_IMAGE_BYTES)
            r.raise_for_status()
        except DartError:
            raise
        except Exception as e:
            raise DartError(SCRAPE_FAILED, "Could not fetch image.", status=502) from e
        media_type = r.headers.get("content-type", "image/jpeg")
        if not media_type.startswith("image/"):
            raise DartError(SCRAPE_FAILED, "URL is not an image.", status=400)
        return Response(
            content=r.content,
            media_type=media_type,
            headers={
                # The upstream content type is attacker-influenced; never let the
                # browser sniff it into something else, and make sure an SVG's
                # scripts can't run if the proxied URL is opened directly.
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
                "Cache-Control": "public, max-age=86400",
            },
        )

    @app.get("/store-products", dependencies=[Depends(store_rl)])
    async def store_products(url: str = Query(...)) -> dict:
        # Pull a store's PUBLIC Shopify products feed (`/products.json`) so a merchant
        # can batch-generate ads for their whole catalogue — no app, no OAuth, no key.
        # SSRF-guarded like the image proxy.
        import re

        parsed = urlparse(url if "://" in url else f"https://{url}")
        if not parsed.netloc:
            raise DartError(INVALID_URL, "Enter your store URL.", status=400)

        # A product-page link imports just that product (Shopify exposes
        # /products/<handle>.json) — whether at /products/x or nested under a
        # collection (/collections/y/products/x); a bare store URL imports all.
        handle = re.search(r"/products/([^/?#.]+)", parsed.path or "")
        if handle:
            product = await _fetch_shopify_product(parsed.netloc, handle.group(1))
            if product:
                logo = await _fetch_store_logo(f"https://{parsed.netloc}")
                return {"products": [product], "logo": logo}

        feed = f"https://{parsed.netloc}/products.json?limit=100"
        try:
            r = await _ssrf_safe_get(feed)
            r.raise_for_status()
            data = r.json()
            # A real Shopify feed is {"products": [...]}. Anything else (a bare
            # array, an HTML error page that happens to parse, a JSON object with
            # no products) is "not a feed" → fall through to page scraping.
            products = data.get("products") if isinstance(data, dict) else None
            if not isinstance(products, list):
                raise ValueError("not a Shopify products feed")
        except DartError:
            raise
        except Exception as e:
            # Not a Shopify feed — fall back to reading the pasted page itself as a
            # single product (JSON-LD / OpenGraph), so any product link works.
            page_url = url if "://" in url else f"https://{url}"
            product = await _fetch_product_page(page_url)
            if product:
                logo = await _fetch_store_logo(f"https://{parsed.netloc}")
                return {"products": [product], "logo": logo}
            raise DartError(
                SCRAPE_FAILED,
                "Couldn't read that link — paste a Shopify store URL, or a product page that publishes its product data.",
                status=502,
            ) from e

        out: list[dict] = []
        for p in products[:100]:
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

    @app.post("/save-ad", dependencies=[Depends(save_rl)])
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
        price_cents: int = Form(0),
        brand_accent: str = Form(""),
        logo_knockout: bool = Form(False),
        image: UploadFile | None = File(None),
        logo: UploadFile | None = File(None),
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
        # carry "/" or ".." into a path (a legit UUID is unchanged). Reject outright
        # if nothing safe survives — falling back to a fixed placeholder would let
        # the first caller to hit this permanently squat that id for everyone else.
        safe_id = "".join(c for c in id if c.isalnum() or c in "-_")
        if not safe_id:
            raise DartError(INVALID_INPUT, "Invalid ad id.", status=400)

        base = settings.supabase_url.rstrip("/")
        key = settings.supabase_service_key
        auth = {"Authorization": f"Bearer {key}", "apikey": key}

        import httpx

        def public_url(path: str) -> str:
            return f"{base}/storage/v1/object/public/{VIDEO_BUCKET}/{path}"

        async with httpx.AsyncClient(timeout=120.0) as client:
            # Fast-path only: this check-then-act has a real gap (two concurrent
            # saves with the same client-chosen id can both read "doesn't exist
            # yet" and race to write). It just avoids wasting an upload on an id
            # that's obviously already someone else's; the write at the bottom
            # is what actually enforces ownership atomically.
            r = await client.get(
                f"{base}/rest/v1/dart_ads",
                headers=auth,
                params={"id": f"eq.{safe_id}", "select": "user_id", "limit": "1"},
            )
            if r.status_code != 200:
                raise DartError(
                    SCRAPE_FAILED, "Could not verify the ad id.", status=502
                )
            rows = r.json()
            if rows and rows[0].get("user_id") != user_id:
                raise DartError(
                    UNAUTHORIZED, "That ad id belongs to another user.", status=403
                )

            image_url: str | None = None
            if image is not None:
                img_bytes = await image.read()
                if len(img_bytes) > MAX_IMAGE_UPLOAD_BYTES:
                    raise DartError(SCRAPE_FAILED, "Image is too large.", status=413)
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
                    # Don't echo the upstream body to the client — log it, return generic.
                    log.warning("save-ad image upload failed (%s): %s", r.status_code, r.text)
                    raise DartError(SCRAPE_FAILED, "Image upload failed.", status=502)
                image_url = public_url(img_path)

            # The brand mark used for this ad, so editing it later can reproduce the
            # exact branding. Best-effort — a failed (or oversized) logo upload must
            # not fail the save.
            logo_url: str | None = None
            if logo is not None:
                logo_bytes = await logo.read()
                if logo_bytes and len(logo_bytes) <= MAX_IMAGE_UPLOAD_BYTES:
                    lext = (logo.filename or "logo.png").rsplit(".", 1)[-1].lower()
                    lext = "".join(c for c in lext if c.isalnum()) or "png"
                    logo_path = f"{user_id}/logo-{safe_id}.{lext}"
                    lr = await client.post(
                        f"{base}/storage/v1/object/{VIDEO_BUCKET}/{logo_path}",
                        headers={
                            **auth,
                            "x-upsert": "true",
                            "Content-Type": logo.content_type or "image/png",
                        },
                        content=logo_bytes,
                    )
                    if lr.status_code < 300:
                        logo_url = public_url(logo_path)

            vid_bytes = await video.read()
            if len(vid_bytes) > MAX_VIDEO_UPLOAD_BYTES:
                raise DartError(SCRAPE_FAILED, "Video is too large.", status=413)
            vid_type = video.content_type or "video/mp4"
            vid_ext = "webm" if "webm" in vid_type else "mp4"
            # Normalise Safari's darker sRGB-tagged colour to BT.709 (lossless).
            # Off-thread so the ffmpeg stream-copy doesn't block the event loop.
            if vid_ext == "mp4" and settings.video_retag_enabled:
                vid_bytes = await asyncio.to_thread(_retag_bt709, vid_bytes)
            vid_path = f"{user_id}/{safe_id}.{vid_ext}"
            r = await client.post(
                f"{base}/storage/v1/object/{VIDEO_BUCKET}/{vid_path}",
                headers={**auth, "x-upsert": "true", "Content-Type": vid_type},
                content=vid_bytes,
            )
            if r.status_code >= 300:
                log.warning("save-ad video upload failed (%s): %s", r.status_code, r.text)
                raise DartError(SCRAPE_FAILED, "Video upload failed.", status=502)
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
                "price_cents": price_cents or None,
                "brand_accent": brand_accent or None,
                "logo_url": logo_url,
                "logo_knockout": logo_knockout if logo_url else None,
            }
            # Plain INSERT first, not an upsert: Postgres's own primary-key
            # constraint is what makes first-claim-on-an-id atomic, closing the
            # race the fast-path check above can't. Two concurrent saves with
            # the same fresh id can no longer both "win" — exactly one INSERT
            # succeeds, the other gets a conflict and falls into the branch
            # below, which re-checks the CURRENT owner (not the stale
            # fast-path read) before ever touching an existing row.
            r = await client.post(
                f"{base}/rest/v1/dart_ads",
                headers={
                    **auth,
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                },
                json=row,
            )
            if r.status_code == 409:
                owner = await client.get(
                    f"{base}/rest/v1/dart_ads",
                    headers=auth,
                    params={"id": f"eq.{safe_id}", "select": "user_id", "limit": "1"},
                )
                current = owner.json() if owner.status_code == 200 else []
                if not current or current[0].get("user_id") != user_id:
                    # This request lost the id race, but its uploads already
                    # landed (under this user's own prefix — no cross-user
                    # overwrite, just unreferenced files). Best-effort delete so
                    # the rejected save doesn't permanently inflate the loser's
                    # storage usage; a failed delete only leaves the same
                    # orphan we'd otherwise have kept.
                    orphans = [vid_path]
                    if image_url:
                        orphans.append(img_path)
                    if logo_url:
                        orphans.append(logo_path)
                    for path in orphans:
                        try:
                            await client.delete(
                                f"{base}/storage/v1/object/{VIDEO_BUCKET}/{path}",
                                headers=auth,
                            )
                        except Exception:
                            pass
                    raise DartError(
                        UNAUTHORIZED, "That ad id belongs to another user.", status=403
                    )
                # It's genuinely ours (an update, or we lost a race against our
                # own double-submit) — update, scoped by id AND user_id so this
                # write still can't touch a row it doesn't own even if the
                # owner somehow changed between the check above and now.
                r = await client.patch(
                    f"{base}/rest/v1/dart_ads",
                    headers={
                        **auth,
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    },
                    params={"id": f"eq.{safe_id}", "user_id": f"eq.{user_id}"},
                    json=row,
                )
            if r.status_code >= 300:
                log.warning("save-ad row write failed (%s): %s", r.status_code, r.text)
                raise DartError(SCRAPE_FAILED, "Saving the ad failed.", status=502)

        return {"video_url": video_url, "image_url": image_url}

    @app.get("/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "save_ad_ready": bool(settings.supabase_url and settings.supabase_service_key),
            # Whether the Safari colour re-tag will actually run on saves: it needs
            # ffmpeg on the host and the feature enabled.
            "video_retag_ready": bool(
                settings.video_retag_enabled and shutil.which("ffmpeg")
            ),
            # Whether signup codes can actually be emailed (Brevo configured).
            "signup_email_ready": authcodes_email_ready(settings),
            # Whether error monitoring is active (SENTRY_DSN configured).
            "monitoring_ready": bool(settings.sentry_dsn),
            "providers": {
                "scraper": type(scraper).__name__,
                "script": type(scripter).__name__,
                "video": type(video).__name__,
            },
        }

    return app


app = create_app()
