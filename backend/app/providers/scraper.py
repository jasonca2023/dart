"""Product scrapers.

MockProductScraper — deterministic, no network. Used when SCRAPER_PROVIDER=mock.
WebProductScraper  — real scraper: fetches the page and extracts product data from
                     JSON-LD, OpenGraph, or (as a fallback) the <title> + common
                     product-image patterns (handles Amazon, Shopify, generic OG).

Note: respect each site's robots/ToS. This issues a single user-initiated fetch of
the URL the user pasted; it is not a crawler.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from html.parser import HTMLParser
from typing import Optional
from urllib.parse import urlparse

from ..errors import INVALID_URL, NO_PRODUCT_IMAGE, SCRAPE_FAILED, DartError
from ..models import Product
from .base import ProductScraper

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    # gzip/deflate only — httpx decodes these without the optional brotli dep.
    "Accept-Encoding": "gzip, deflate",
}

# Common main-image patterns, in priority order (Amazon hiRes/landing, then generic).
_IMAGE_PATTERNS = [
    re.compile(r'"hiRes":"(https://[^"]+\.jpg)"'),
    re.compile(r'data-old-hires="(https://[^"]+\.jpg)"'),
    re.compile(r'id="landingImage"[^>]*\bsrc="(https://[^"]+)"'),
]


def _validate_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise DartError(INVALID_URL, "Provide a valid http(s) product URL.", status=400)


def _source_for(host: str) -> str:
    host = host.lower()
    if "shopify" in host or "myshopify" in host:
        return "shopify"
    if "amazon" in host:
        return "amazon"
    return "web"


def _to_cents(value: object) -> Optional[int]:
    try:
        return round(float(str(value)) * 100)
    except (TypeError, ValueError):
        return None


class MockProductScraper(ProductScraper):
    """Deterministic stand-in so the pipeline runs without network or keys."""

    def __init__(self, delay: float = 0.0) -> None:
        self.delay = delay

    async def scrape(self, url: str) -> Product:
        _validate_url(url)
        if self.delay:
            await asyncio.sleep(self.delay)
        parsed = urlparse(url)
        seed = int(hashlib.sha256(url.encode()).hexdigest(), 16)
        slug = parsed.path.rstrip("/").split("/")[-1] or "product"
        title = slug.replace("-", " ").replace("_", " ").title() or "Premium Product"
        return Product(
            title=title,
            price=1999 + seed % 8000,
            currency="USD",
            images=[f"https://picsum.photos/seed/{seed % 100000}/1024/1024"],
            specs={"vendor": parsed.netloc},
            source=_source_for(parsed.netloc),
        )


# --- Real scraper ----------------------------------------------------------------


class _MetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta: dict[str, str] = {}
        self.ld_blocks: list[str] = []
        self.title: Optional[str] = None
        self._in_ld = False
        self._ld_buf: list[str] = []
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        a = {k: v for k, v in attrs}
        if tag == "meta":
            key = a.get("property") or a.get("name")
            if key and a.get("content"):
                self.meta[key.lower()] = a["content"]  # type: ignore[assignment]
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld = True
            self._ld_buf = []
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._in_ld:
            self._in_ld = False
            raw = "".join(self._ld_buf).strip()
            if raw:
                self.ld_blocks.append(raw)
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_ld:
            self._ld_buf.append(data)
        elif self._in_title and not self.title:
            self.title = data.strip()


def _iter_ld_nodes(raw_blocks: list[str]):
    for raw in raw_blocks:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        candidates = data if isinstance(data, list) else [data]
        for node in candidates:
            if isinstance(node, dict) and "@graph" in node:
                yield from (n for n in node["@graph"] if isinstance(n, dict))
            elif isinstance(node, dict):
                yield node


def _from_ld(raw_blocks: list[str], url: str) -> Optional[Product]:
    for node in _iter_ld_nodes(raw_blocks):
        types = node.get("@type")
        types = types if isinstance(types, list) else [types]
        if "Product" not in types:
            continue
        images = node.get("image") or []
        images = images if isinstance(images, list) else [images]
        offers = node.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        offers = offers if isinstance(offers, dict) else {}
        return Product(
            title=str(node.get("name") or "Product"),
            price=_to_cents(offers.get("price")),
            currency=str(offers.get("priceCurrency", "USD")),
            images=[str(i) for i in images if i],
            specs={"brand": str(node["brand"])} if isinstance(node.get("brand"), str) else {},
            source=_source_for(urlparse(url).netloc),
        )
    return None


def _clean_title(raw: str, host: str) -> str:
    title = (raw or "").strip()
    if "amazon" in host.lower():
        # "Amazon.com: <name> | <marketing> | <brand> : Electronics" -> "<name>"
        title = re.sub(r"^Amazon\.com\s*:\s*", "", title)
        title = title.split(" | ")[0]
        title = title.split(" : ")[0]
    return title.strip() or "Product"


def _find_image(html: str, meta: dict[str, str]) -> Optional[str]:
    if meta.get("og:image"):
        return meta["og:image"]
    for pattern in _IMAGE_PATTERNS:
        m = pattern.search(html)
        if m:
            return m.group(1)
    return None


def _from_page(html: str, meta: dict[str, str], page_title: Optional[str], url: str) -> Optional[Product]:
    host = urlparse(url).netloc
    image = _find_image(html, meta)
    if not image:
        return None
    title = _clean_title(meta.get("og:title") or page_title or "", host)
    return Product(
        title=title,
        price=_to_cents(meta.get("product:price:amount")),
        currency=meta.get("product:price:currency", "USD"),
        images=[image],
        source=_source_for(host),
    )


class WebProductScraper(ProductScraper):
    def __init__(self, timeout: float = 20.0) -> None:
        self.timeout = timeout

    async def scrape(self, url: str) -> Product:
        _validate_url(url)
        try:
            import httpx
        except ImportError as e:  # pragma: no cover - dependency guard
            raise DartError(SCRAPE_FAILED, "httpx is not installed.", status=500) from e

        try:
            async with httpx.AsyncClient(
                timeout=self.timeout, follow_redirects=True, headers=_BROWSER_HEADERS
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                html = resp.text
        except Exception as e:
            raise DartError(
                SCRAPE_FAILED,
                "Could not resolve product data from URL.",
                status=502,
                retryable=True,
            ) from e

        parser = _MetaParser()
        parser.feed(html)
        product = _from_ld(parser.ld_blocks, url) or _from_page(html, parser.meta, parser.title, url)
        if product is None or not product.images:
            raise DartError(
                NO_PRODUCT_IMAGE,
                "Could not find product data (title + image) on the page.",
                status=422,
            )
        return product


# Back-compat alias (factory historically referenced JsonLdProductScraper).
JsonLdProductScraper = WebProductScraper
