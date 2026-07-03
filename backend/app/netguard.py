"""Shared SSRF guard for every place the backend fetches a user-supplied URL
(the image proxy, the store importer, and the legacy web scraper).

Only http(s) URLs whose host resolves exclusively to public addresses are
fetched, and redirects are followed manually so every hop is re-validated —
otherwise a public URL could bounce into loopback/link-local/private space
(e.g. the cloud metadata service at 169.254.169.254).

Known limitation: the host is resolved once for validation and again by the
HTTP client (a DNS-rebinding TOCTOU). Closing that fully requires pinning the
connection to the validated IP; out of scope for this service.
"""

from __future__ import annotations

import ipaddress
import socket

from urllib.parse import urlparse

from .errors import INVALID_URL, SCRAPE_FAILED, DartError

# A realistic browser profile — several stores' bot filters reject the bare
# "Mozilla/5.0" but serve the same public page to a normal browser string.
# gzip/deflate only: httpx decodes these without the optional brotli dep.
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
}


def is_public_host(host: str | None) -> bool:
    """True only when every address `host` resolves to is a public IP."""
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


async def ssrf_safe_get(
    url: str,
    *,
    max_redirects: int = 5,
    timeout: float = 20.0,
    headers: dict[str, str] | None = None,
    max_bytes: int | None = None,
):
    """GET `url`, re-validating every redirect hop's host against private ranges.

    Raises DartError on a disallowed host, a bad scheme, too many redirects, or
    (when `max_bytes` is set) a response larger than the cap.
    """
    import httpx

    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=False,
        headers=headers or BROWSER_HEADERS,
    ) as client:
        current = url
        for _ in range(max_redirects):
            p = urlparse(current)
            if p.scheme not in ("http", "https") or not p.netloc:
                raise DartError(INVALID_URL, "Bad url.", status=400)
            if not is_public_host(p.hostname):
                raise DartError(INVALID_URL, "Host is not allowed.", status=400)
            r = await client.get(current)
            if r.is_redirect and "location" in r.headers:
                current = str(httpx.URL(current).join(r.headers["location"]))
                continue
            if max_bytes is not None:
                declared = r.headers.get("content-length")
                too_big = declared is not None and declared.isdigit() and int(declared) > max_bytes
                if too_big or len(r.content) > max_bytes:
                    raise DartError(SCRAPE_FAILED, "Response is too large.", status=502)
            return r
        raise DartError(SCRAPE_FAILED, "Too many redirects.", status=502)
