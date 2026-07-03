"""Edge-case tests: the SSRF guard, proxy validation, /save-ad ownership +
config guards, and the legacy contract's bounds. No network — external calls
are either blocked before any I/O or served by a fake httpx client."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.netguard import is_public_host


def make_client(**overrides) -> TestClient:
    kwargs = {
        "mock_stage_delay_sec": 0.0,
        "scraper_provider": "mock",
        "script_provider": "mock",
        "video_provider": "mock",
        "supabase_url": None,
        "supabase_service_key": None,
        "_env_file": None,  # hermetic: ignore any local .env
        **overrides,
    }
    return TestClient(create_app(Settings(**kwargs)))


# --- SSRF guard --------------------------------------------------------------


@pytest.mark.parametrize(
    "host",
    ["localhost", "127.0.0.1", "169.254.169.254", "10.0.0.1", "0.0.0.0", "::1", "", None],
)
def test_private_hosts_are_not_public(host):
    assert not is_public_host(host)


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:8000/etc/passwd",
        "http://169.254.169.254/latest/meta-data/",
        "file:///etc/passwd",
        "not a url at all",
    ],
)
def test_proxy_image_blocks_disallowed_urls(url):
    client = make_client()
    r = client.get("/proxy-image", params={"url": url})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_url"


def test_proxy_image_requires_url():
    client = make_client()
    assert client.get("/proxy-image").status_code == 422


def test_store_products_rejects_empty_and_private():
    client = make_client()
    assert client.get("/store-products", params={"url": ""}).status_code == 400
    r = client.get("/store-products", params={"url": "http://localhost:9999"})
    assert r.status_code in (400, 502)


# --- /save-ad ------------------------------------------------------------------


def test_save_ad_unconfigured_returns_error_envelope():
    client = make_client()
    r = client.post(
        "/save-ad",
        data={"token": "tok", "id": "abc"},
        files={"video": ("a.mp4", b"xx", "video/mp4")},
    )
    assert r.status_code == 500
    assert r.json()["error"]["code"]


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self._json = json_data if json_data is not None else {}
        self.text = ""

    def json(self):
        return self._json


def _fake_httpx_client(row_owner: str | None):
    """An httpx.AsyncClient stand-in: token belongs to 'user-b'; the dart_ads
    row for any id belongs to `row_owner` (None = no existing row); every
    storage/REST write succeeds."""

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, **kwargs):
            if "/auth/v1/user" in url:
                return _FakeResponse(200, {"id": "user-b"})
            if "/rest/v1/dart_ads" in url:
                rows = [] if row_owner is None else [{"user_id": row_owner}]
                return _FakeResponse(200, rows)
            return _FakeResponse(404, {})

        async def post(self, url, **kwargs):
            return _FakeResponse(200, {})

    return FakeAsyncClient


def _save_ad(client: TestClient, ad_id: str = "ad-1"):
    return client.post(
        "/save-ad",
        data={"token": "tok", "id": ad_id},
        files={"video": ("a.mp4", b"vid", "video/mp4")},
    )


def _supabase_client() -> TestClient:
    return make_client(
        supabase_url="https://fake.supabase.co", supabase_service_key="sb_secret_test"
    )


def test_save_ad_rejects_id_owned_by_another_user(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx_client(row_owner="user-a"))
    r = _save_ad(_supabase_client(), "victim-ad")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "unauthorized"


def test_save_ad_allows_own_id_and_fresh_id(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx_client(row_owner="user-b"))
    r = _save_ad(_supabase_client(), "my-ad")
    assert r.status_code == 200
    assert r.json()["video_url"].endswith("/user-b/my-ad.mp4")

    monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx_client(row_owner=None))
    r = _save_ad(_supabase_client(), "brand-new")
    assert r.status_code == 200


def test_save_ad_sanitizes_hostile_id(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx_client(row_owner=None))
    r = _save_ad(_supabase_client(), "../../evil/path")
    assert r.status_code == 200
    # "/" and "." must never reach the storage key.
    assert r.json()["video_url"].endswith("/user-b/evilpath.mp4")


def test_save_ad_caps_video_size(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx_client(row_owner=None))
    monkeypatch.setattr("app.main.MAX_VIDEO_UPLOAD_BYTES", 10)
    r = _save_ad(_supabase_client(), "big")
    assert r.status_code == 200  # 3-byte video is fine
    client = _supabase_client()
    r = client.post(
        "/save-ad",
        data={"token": "tok", "id": "big"},
        files={"video": ("a.mp4", b"x" * 11, "video/mp4")},
    )
    assert r.status_code == 413


# --- legacy /jobs contract bounds ---------------------------------------------


@pytest.mark.parametrize("duration,expected", [(2, 422), (21, 422), (3, 201), (20, 201)])
def test_jobs_duration_bounds(duration, expected):
    client = make_client()
    r = client.post(
        "/jobs", json={"product_url": "https://x.com/p", "duration_sec": duration}
    )
    assert r.status_code == expected


def test_jobs_validation():
    client = make_client()
    assert client.post("/jobs", json={}).status_code == 422
    assert (
        client.post(
            "/jobs", json={"product_url": "https://x.com/p", "resolution": "720p"}
        ).status_code
        == 422
    )


def test_export_destination_validated():
    client = make_client()
    job = client.post("/jobs", json={"product_url": "https://x.com/p"}).json()
    r = client.post(f"/jobs/{job['id']}/export", json={"destination": "myspace"})
    assert r.status_code == 422
