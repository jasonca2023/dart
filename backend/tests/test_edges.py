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
        "rate_limit_enabled": False,  # opt into it per-test where relevant
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


class _FakeReq:
    def __init__(self, xff=None, peer="9.9.9.9"):
        self.headers = {"x-forwarded-for": xff} if xff else {}
        self.client = type("C", (), {"host": peer})() if peer else None


@pytest.mark.parametrize(
    "xff,expected",
    [
        ("1.1.1.1, 8.8.8.8", "8.8.8.8"),  # attacker prepends a fake hop on the left
        ("8.8.4.4, 8.8.8.8", "8.8.8.8"),  # spoofed public IP on the left can't win
        ("8.8.8.8, 10.0.0.5", "8.8.8.8"),  # private infra hop on the right skipped
        ("8.8.8.8", "8.8.8.8"),  # single real hop
    ],
)
def test_client_ip_resists_xff_spoofing(xff, expected):
    from app.ratelimit import client_ip

    assert client_ip(_FakeReq(xff)) == expected


def test_client_ip_falls_back_to_peer():
    from app.ratelimit import client_ip

    assert client_ip(_FakeReq(None, "9.9.9.9")) == "9.9.9.9"


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


# --- rate limiting -------------------------------------------------------------


def test_proxy_image_rate_limited_after_burst():
    # Limit of 3/min: the first 3 (blocked hosts → 400) pass the limiter; the 4th
    # is refused by the limiter before the handler runs.
    client = make_client(rate_limit_enabled=True, rate_limit_proxy_per_min=3)
    url = "http://127.0.0.1/x"
    codes = [
        client.get("/proxy-image", params={"url": url}).status_code for _ in range(4)
    ]
    assert codes[:3] == [400, 400, 400]
    assert codes[3] == 429
    body = client.get("/proxy-image", params={"url": url}).json()
    assert body["error"]["code"] == "rate_limited"


def test_rate_limit_disabled_lets_burst_through():
    client = make_client(rate_limit_enabled=False)
    codes = [
        client.get("/proxy-image", params={"url": "http://127.0.0.1/x"}).status_code
        for _ in range(6)
    ]
    assert all(c == 400 for c in codes)  # never a 429


# --- legacy job store + auth ---------------------------------------------------


def test_job_store_is_bounded():
    from app.store import _MAX_JOBS, JobStore

    store = JobStore()
    first = store.create(
        product_url="u0",
        target_audience="a",
        aspect_ratio="16:9",
        duration_sec=10,
        resolution="1080p",
    )
    for i in range(_MAX_JOBS + 50):
        store.create(
            product_url=f"u{i}",
            target_audience="a",
            aspect_ratio="16:9",
            duration_sec=10,
            resolution="1080p",
        )
    assert len(store.list()) == _MAX_JOBS  # capped
    # The oldest job was evicted.
    from app.errors import DartError

    try:
        store.get(first.id)
        assert False, "expected the oldest job to be evicted"
    except DartError as e:
        assert e.status == 404


def test_get_job_requires_auth_when_supabase_configured():
    # With SUPABASE_URL set, an anonymous GET /jobs/{id} is rejected before any
    # network call (no Bearer header → 401).
    client = make_client(supabase_url="https://fake.supabase.co")
    r = client.get("/jobs/whatever")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


# --- Safari colour re-tag ------------------------------------------------------


def _colr_box(transfer: int) -> bytes:
    # [size4]['colr']['nclx'][primaries2][transfer2][matrix2][flags1]
    return (
        b"\x00\x00\x00\x13colrnclx"
        + (1).to_bytes(2, "big")
        + transfer.to_bytes(2, "big")
        + (1).to_bytes(2, "big")
        + b"\x80"
    )


def test_mp4_transfer_detection():
    from app.main import _mp4_transfer_characteristic

    assert _mp4_transfer_characteristic(b"ftyp" + _colr_box(13)) == 13
    assert _mp4_transfer_characteristic(b"ftyp" + _colr_box(1)) == 1
    assert _mp4_transfer_characteristic(b"no colr here") is None


def test_retag_passes_through_non_safari():
    from app.main import _retag_bt709

    # transfer != 13 (Chrome) and no-colr both come back byte-identical, untouched.
    chrome = b"ftyp" + _colr_box(1)
    assert _retag_bt709(chrome) == chrome
    assert _retag_bt709(b"not an mp4") == b"not an mp4"


def test_retag_degrades_gracefully_on_bad_input():
    from app.main import _retag_bt709

    # Tagged 13 but not a real mp4 → ffmpeg fails (or is absent) → original bytes.
    garbage13 = b"ftyp" + _colr_box(13) + b"\x00" * 32
    assert _retag_bt709(garbage13) == garbage13


# --- Signup email codes -------------------------------------------------------


def test_signup_code_rejects_bad_email():
    c = make_client()
    r = c.post("/auth/signup/code", json={"email": "not-an-email"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_input"


def test_signup_endpoints_unconfigured_are_500():
    c = make_client()
    assert c.post("/auth/signup/code", json={"email": "a@b.com"}).status_code == 500
    r = c.post(
        "/auth/signup/verify",
        json={"email": "a@b.com", "code": "123456", "password": "Passw0rd!"},
    )
    assert r.status_code == 500


def test_signup_verify_validates_shape():
    c = make_client()
    r = c.post(
        "/auth/signup/verify",
        json={"email": "a@b.com", "code": "12", "password": "Passw0rd!"},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_input"
    r = c.post(
        "/auth/signup/verify",
        json={"email": "a@b.com", "code": "123456", "password": "short"},
    )
    assert r.status_code == 400


def test_code_hash_deterministic_case_insensitive_peppered():
    from app.authcodes import gen_code, hash_code

    s1 = Settings(supabase_service_key="k1", _env_file=None)
    s2 = Settings(supabase_service_key="k2", _env_file=None)
    assert hash_code(s1, "a@b.com", "123456") == hash_code(s1, "A@B.com", "123456")
    assert hash_code(s1, "a@b.com", "123456") != hash_code(s2, "a@b.com", "123456")
    # purpose-scoped: a signup code can never verify as a reset code
    assert hash_code(s1, "a@b.com", "123456") != hash_code(
        s1, "a@b.com", "123456", "reset"
    )
    for _ in range(50):
        code = gen_code()
        assert len(code) == 6 and code.isdigit()


def test_create_user_maps_gotrue_replies(monkeypatch):
    """422 means "exists" only when GoTrue says so — a password-policy 422 is
    the user's error (400 invalid_input), not a conflict."""
    import asyncio

    from app import authcodes
    from app.errors import DartError

    s = Settings(
        supabase_url="https://x.supabase.co", supabase_service_key="svc", _env_file=None
    )
    real_client = httpx.AsyncClient

    def respond_with(status: int, body: dict) -> None:
        transport = httpx.MockTransport(lambda req: httpx.Response(status, json=body))

        class Client(real_client):
            def __init__(self, **kw):
                super().__init__(**kw, transport=transport)

        monkeypatch.setattr(authcodes.httpx, "AsyncClient", Client)

    respond_with(200, {"id": "u1"})
    assert asyncio.run(authcodes.create_confirmed_user(s, "a@b.com", "Passw0rd!")) == "ok"

    respond_with(
        422, {"msg": "A user with this email address has already been registered"}
    )
    assert (
        asyncio.run(authcodes.create_confirmed_user(s, "a@b.com", "Passw0rd!"))
        == "exists"
    )

    respond_with(
        422,
        {"error_code": "weak_password", "msg": "Password should be at least 10 characters."},
    )
    with pytest.raises(DartError) as ei:
        asyncio.run(authcodes.create_confirmed_user(s, "a@b.com", "Passw0rd!"))
    assert ei.value.status == 400 and ei.value.code == "invalid_input"
    assert "10 characters" in ei.value.message


def test_signup_flow_with_fakes(monkeypatch):
    """Full flow against in-memory fakes: send → cooldown → wrong code → right
    code creates the account → existing email is refused at the send step."""
    from datetime import datetime, timedelta, timezone

    from app import authcodes
    from app.errors import INVALID_INPUT, DartError

    store: dict[str, dict] = {}
    sent: dict[str, str] = {}

    async def fake_user_exists(s, email):
        return email == "taken@x.com"

    async def fake_get(s, email):
        return store.get(email)

    async def fake_store(s, email, code_hash):
        now = datetime.now(timezone.utc)
        store[email] = {
            "email": email,
            "code_hash": code_hash,
            "attempts": 0,
            "expires_at": (now + timedelta(minutes=10)).isoformat(),
            "created_at": now.isoformat(),
        }

    async def fake_bump(s, email, n):
        store[email]["attempts"] = n

    async def fake_delete(s, email):
        store.pop(email, None)

    async def fake_send(s, to, code, purpose="signup"):
        sent[to] = code

    async def fake_create(s, email, pw):
        if pw == "Policy-reject1!":  # simulate GoTrue's password-policy 422
            raise DartError(INVALID_INPUT, "Password should be different.", status=400)
        return "ok"

    monkeypatch.setattr(authcodes, "user_exists", fake_user_exists)
    monkeypatch.setattr(authcodes, "get_code_row", fake_get)
    monkeypatch.setattr(authcodes, "store_code", fake_store)
    monkeypatch.setattr(authcodes, "bump_attempts", fake_bump)
    monkeypatch.setattr(authcodes, "delete_code", fake_delete)
    monkeypatch.setattr(authcodes, "send_code_email", fake_send)
    monkeypatch.setattr(authcodes, "create_confirmed_user", fake_create)

    c = make_client(
        supabase_url="https://x.supabase.co",
        supabase_service_key="svc",
        brevo_api_key="brevo",
        auth_email_from="codes@dart.test",
    )

    # send a code
    assert c.post("/auth/signup/code", json={"email": "new@x.com"}).status_code == 200
    assert len(sent["new@x.com"]) == 6
    # immediate resend hits the per-address cooldown
    assert c.post("/auth/signup/code", json={"email": "new@x.com"}).status_code == 429
    # wrong code is rejected and counted
    wrong = "000000" if sent["new@x.com"] != "000000" else "000001"
    r = c.post(
        "/auth/signup/verify",
        json={"email": "new@x.com", "code": wrong, "password": "Passw0rd!"},
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_code"
    assert store["new@x.com"]["attempts"] == 1
    # a password GoTrue's policy rejects is a 400 — and the code row survives,
    # so the same code still works with a better password
    r = c.post(
        "/auth/signup/verify",
        json={
            "email": "new@x.com",
            "code": sent["new@x.com"],
            "password": "Policy-reject1!",
        },
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_input"
    assert "new@x.com" in store
    # the right code creates the account and consumes the row
    r = c.post(
        "/auth/signup/verify",
        json={"email": "new@x.com", "code": sent["new@x.com"], "password": "Passw0rd!"},
    )
    assert r.status_code == 200 and r.json()["created"] is True
    assert "new@x.com" not in store
    # an email that already has an account is refused at the send step
    assert c.post("/auth/signup/code", json={"email": "taken@x.com"}).status_code == 409


def test_reset_flow_with_fakes(monkeypatch):
    """Password reset: unknown email → 404; the code round-trip sets the new
    password via the admin API; a signup-purpose code can't verify as reset."""
    from datetime import datetime, timedelta, timezone

    from app import authcodes

    store: dict[str, dict] = {}
    sent: dict[str, str] = {}
    passwords: dict[str, str] = {}

    async def fake_user_exists(s, email):
        return email == "user@x.com"

    async def fake_user_id(s, email):
        return "uid-1" if email == "user@x.com" else None

    async def fake_get(s, email):
        return store.get(email)

    async def fake_store(s, email, code_hash):
        now = datetime.now(timezone.utc)
        store[email] = {
            "email": email,
            "code_hash": code_hash,
            "attempts": 0,
            "expires_at": (now + timedelta(minutes=10)).isoformat(),
            "created_at": now.isoformat(),
        }

    async def fake_bump(s, email, n):
        store[email]["attempts"] = n

    async def fake_delete(s, email):
        store.pop(email, None)

    async def fake_send(s, to, code, purpose="signup"):
        sent[to] = code

    async def fake_set_password(s, user_id, pw):
        passwords[user_id] = pw

    monkeypatch.setattr(authcodes, "user_exists", fake_user_exists)
    monkeypatch.setattr(authcodes, "user_id_by_email", fake_user_id)
    monkeypatch.setattr(authcodes, "get_code_row", fake_get)
    monkeypatch.setattr(authcodes, "store_code", fake_store)
    monkeypatch.setattr(authcodes, "bump_attempts", fake_bump)
    monkeypatch.setattr(authcodes, "delete_code", fake_delete)
    monkeypatch.setattr(authcodes, "send_code_email", fake_send)
    monkeypatch.setattr(authcodes, "set_user_password", fake_set_password)

    c = make_client(
        supabase_url="https://x.supabase.co",
        supabase_service_key="svc",
        brevo_api_key="brevo",
        auth_email_from="codes@dart.test",
    )

    # an email with no account is refused
    r = c.post("/auth/reset/code", json={"email": "nobody@x.com"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
    # a known email gets a code
    assert c.post("/auth/reset/code", json={"email": "user@x.com"}).status_code == 200
    real_code = sent["user@x.com"]
    assert len(real_code) == 6
    # a signup-purpose hash for the same code must not verify as a reset code
    store["user@x.com"]["code_hash"] = authcodes.hash_code(
        c.app.state.settings, "user@x.com", real_code, "signup"
    )
    r = c.post(
        "/auth/reset/verify",
        json={"email": "user@x.com", "code": real_code, "password": "NewPassw0rd!"},
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_code"
    assert store["user@x.com"]["attempts"] == 1
    # restore the real (reset-purpose) hash: the right code sets the password
    store["user@x.com"]["code_hash"] = authcodes.hash_code(
        c.app.state.settings, "user@x.com", real_code, "reset"
    )
    r = c.post(
        "/auth/reset/verify",
        json={
            "email": "user@x.com",
            "code": real_code,
            "password": "NewPassw0rd!",
        },
    )
    assert r.status_code == 200 and r.json()["reset"] is True
    assert passwords["uid-1"] == "NewPassw0rd!"
    assert "user@x.com" not in store
