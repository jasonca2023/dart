"""Product scrapers.

MockProductScraper   — deterministic, no network. Default for the vertical slice.
JsonLdProductScraper — best-effort real scraper using JSON-LD / OpenGraph metadata.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from html.parser import HTMLParser
from typing import Optional
from urllib.parse import urlparse

from ..errors import INVALID_URL, NO_PRODUCT_IMAGE, SCRAPE_FAILED, DartError
from ..models import Product
from .base import ProductScraper


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
            price=1999 + seed % 8000,  # $19.99–$99.99
            currency="USD",
            images=[f"https://picsum.photos/seed/{seed % 100000}/1024/1024"],
            specs={"vendor": parsed.netloc},
            source=_source_for(parsed.netloc),
        )


# --- JSON-LD / OpenGraph scraper -------------------------------------------------


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


def _to_cents(value: object) -> Optional[int]:
    try:
        return round(float(str(value)) * 100)
    except (TypeError, ValueError):
        return None


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
        return Product(
            title=str(node.get("name") or "Product"),
            price=_to_cents(offers.get("price")) if isinstance(offers, dict) else None,
            currency=str(offers.get("priceCurrency", "USD")) if isinstance(offers, dict) else "USD",
            images=[str(i) for i in images if i],
            specs={"brand": str(node["brand"])} if isinstance(node.get("brand"), str) else {},
            source=_source_for(urlparse(url).netloc),
        )
    return None


def _from_meta(meta: dict[str, str], title: Optional[str], url: str) -> Optional[Product]:
    image = meta.get("og:image")
    if not image:
        return None
    return Product(
        title=meta.get("og:title") or title or "Product",
        price=_to_cents(meta.get("product:price:amount")),
        currency=meta.get("product:price:currency", "USD"),
        images=[image],
        source=_source_for(urlparse(url).netloc),
    )


class JsonLdProductScraper(ProductScraper):
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
                timeout=self.timeout,
                follow_redirects=True,
                headers={"User-Agent": "DartBot/0.1 (+https://dart.studio)"},
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
        product = _from_ld(parser.ld_blocks, url) or _from_meta(parser.meta, parser.title, url)
        if product is None or not product.images:
            raise DartError(
                NO_PRODUCT_IMAGE,
                "No usable product image found on the page.",
                status=422,
            )
        return product
