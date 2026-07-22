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


def _fake_httpx_client(
    row_owner: str | None,
    *,
    insert_conflict: bool = False,
    race_winner: str | None = None,
):
    """An httpx.AsyncClient stand-in: token belongs to 'user-b'; the fast-path
    GET reports the dart_ads row for any id as belonging to `row_owner` (None =
    no existing row); every storage upload succeeds.

    `insert_conflict` simulates the race the atomic-insert fix closes: the
    plain INSERT at the end returns 409 (as if another request's INSERT won
    the race between our fast-path read and our own write), and the
    re-check GET that follows reports the row now belongs to `race_winner`.
    """

    deleted: list[str] = []

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
                # First GET is the fast-path (row_owner); once the INSERT has
                # reported a conflict, the re-check GET reports race_winner.
                owner = race_winner if getattr(self, "_conflicted", False) else row_owner
                rows = [] if owner is None else [{"user_id": owner}]
                return _FakeResponse(200, rows)
            return _FakeResponse(404, {})

        async def post(self, url, **kwargs):
            if "/rest/v1/dart_ads" in url and insert_conflict:
                self._conflicted = True
                return _FakeResponse(409, {})
            return _FakeResponse(200, {})

        async def patch(self, url, **kwargs):
            return _FakeResponse(200, {})

        async def delete(self, url, **kwargs):
            deleted.append(url)
            return _FakeResponse(200, {})

    FakeAsyncClient.deleted = deleted
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


def test_save_ad_insert_race_loser_gets_403_not_a_silent_overwrite(monkeypatch):
    # The exact race the atomic-insert fix closes: the fast-path GET sees no
    # row yet (row_owner=None, so it passes), but by the time this request's
    # own INSERT lands, a concurrent request from "user-a" has already
    # claimed the id — the INSERT conflicts, and re-checking the NOW-current
    # owner (not the stale fast-path read) must reject this request rather
    # than silently overwrite user-a's row.
    fake = _fake_httpx_client(row_owner=None, insert_conflict=True, race_winner="user-a")
    monkeypatch.setattr(httpx, "AsyncClient", fake)
    r = _save_ad(_supabase_client(), "contested-ad")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "unauthorized"
    # The loser's already-uploaded video must be cleaned up, not left as an
    # unreferenced storage orphan inflating its owner's usage forever.
    assert any("contested-ad" in url for url in fake.deleted)


def test_save_ad_insert_conflict_against_own_row_falls_back_to_update(monkeypatch):
    # A double-submit (or a race against yourself, e.g. two tabs) still has to
    # work: if the row that won the INSERT race is actually the caller's own,
    # this must fall through to the ownership-scoped PATCH and succeed.
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        _fake_httpx_client(row_owner=None, insert_conflict=True, race_winner="user-b"),
    )
    r = _save_ad(_supabase_client(), "my-own-race")
    assert r.status_code == 200


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


def test_save_ad_rejects_id_that_sanitizes_to_empty(monkeypatch):
    # An id with no alnum/-/_ characters must be rejected outright, not silently
    # collapsed to a shared placeholder id that the first caller permanently
    # squats and every later caller is then locked out of.
    monkeypatch.setattr(httpx, "AsyncClient", _fake_httpx_client(row_owner=None))
    r = _save_ad(_supabase_client(), "!!!///???")
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_input"


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


# --- /settings admin gate -------------------------------------------------------


def test_settings_routes_disabled_without_admin_key():
    # No SETTINGS_ADMIN_KEY configured → the runtime-settings surface doesn't
    # exist, even for authenticated users. 404, not 401/403, so probes can't
    # tell "disabled" apart from "absent".
    client = make_client()
    assert client.get("/settings").status_code == 404
    assert (
        client.post("/settings/ltx-key", json={"api_key": "sk-x"}).status_code == 404
    )


def test_settings_routes_require_matching_admin_key():
    client = make_client(settings_admin_key="op-secret")
    # Wrong or missing key → 401. A plain user login is NOT enough: these
    # routes mutate global provider config.
    assert client.get("/settings").status_code == 401
    assert (
        client.get("/settings", headers={"X-Admin-Key": "nope"}).status_code == 401
    )
    r = client.get("/settings", headers={"X-Admin-Key": "op-secret"})
    assert r.status_code == 200
    assert r.json()["ltx_key_set"] is False

    r = client.post(
        "/settings/ltx-key",
        json={"api_key": "sk-test"},
        headers={"X-Admin-Key": "op-secret"},
    )
    assert r.status_code == 200
    assert r.json()["ltx_key_set"] is True
    assert r.json()["video_provider"] == "ltx"


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


# --- mock script scenes ----------------------------------------------------------


@pytest.mark.parametrize("duration", [3, 4, 5, 10, 20])
def test_mock_script_scenes_tile_duration_with_no_zero_length(duration):
    # The contract accepts duration >= 3; every scene must have t_end > t_start
    # and the set must tile [0, duration] (the old max(2, d//3) first cut
    # collided with 2*d//3 at d=3-4, emitting a zero-length middle scene).
    import asyncio

    from app.models import Product
    from app.providers.script import MockScriptGenerator

    product = Product(title="Thing", price=100, currency="USD", images=[], source="web")
    result = asyncio.run(
        MockScriptGenerator().generate(
            product=product,
            target_audience="testers",
            aspect_ratio="16:9",
            duration_sec=duration,
        )
    )
    scenes = result.script.scenes
    assert scenes[0].t_start == 0
    assert scenes[-1].t_end == duration
    for s in scenes:
        assert s.t_end > s.t_start
    for prev, nxt in zip(scenes, scenes[1:]):
        assert prev.t_end == nxt.t_start


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
        user_id="u",
        product_url="u0",
        target_audience="a",
        aspect_ratio="16:9",
        duration_sec=10,
        resolution="1080p",
    )
    for i in range(_MAX_JOBS + 50):
        store.create(
            user_id="u",
            product_url=f"u{i}",
            target_audience="a",
            aspect_ratio="16:9",
            duration_sec=10,
            resolution="1080p",
        )
    assert len(store.list("u")) == _MAX_JOBS  # capped
    # The oldest job was evicted.
    from app.errors import DartError

    try:
        store.get(first.id, "u")
        assert False, "expected the oldest job to be evicted"
    except DartError as e:
        assert e.status == 404


def test_job_store_scopes_to_owner():
    from app.store import JobStore

    store = JobStore()
    mine = store.create(
        user_id="alice",
        product_url="u0",
        target_audience="a",
        aspect_ratio="16:9",
        duration_sec=10,
        resolution="1080p",
    )
    store.create(
        user_id="bob",
        product_url="u1",
        target_audience="a",
        aspect_ratio="16:9",
        duration_sec=10,
        resolution="1080p",
    )

    # Alice sees only her own job in the list — not Bob's.
    assert [j.id for j in store.list("alice")] == [mine.id]

    # Alice can fetch her own job by id...
    assert store.get(mine.id, "alice").id == mine.id

    # ...but Bob gets a 404, not Alice's data, when he tries the same id.
    from app.errors import DartError

    try:
        store.get(mine.id, "bob")
        assert False, "expected Bob to be denied Alice's job"
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


def _box(btype: bytes, payload: bytes) -> bytes:
    return (8 + len(payload)).to_bytes(4, "big") + btype + payload


def _colr_payload(transfer: int) -> bytes:
    # ['nclx'][primaries2][transfer2][matrix2][full_range1]
    return (
        b"nclx"
        + (1).to_bytes(2, "big")
        + transfer.to_bytes(2, "big")
        + (1).to_bytes(2, "big")
        + b"\x80"
    )


def _visual_sample_entry(codec: bytes, transfer: int) -> bytes:
    sample_entry_fields = b"\x00" * 6 + b"\x00\x01"  # reserved(6) + data_reference_index(2)
    visual_fields = b"\x00" * 70  # fixed VisualSampleEntry fields (values unused by the reader)
    colr = _box(b"colr", _colr_payload(transfer))
    return _box(codec, sample_entry_fields + visual_fields + colr)


def _mp4_with_transfer(transfer: int, mdat_prefix: bytes = b"") -> bytes:
    """A minimal but structurally real mp4: ftyp, then mdat, then moov (mdat
    BEFORE moov — the common non-faststarted layout browser-side muxers
    produce, and the exact layout the false-positive bug depended on)."""
    stsd_entries = (0).to_bytes(4, "big") + (1).to_bytes(4, "big")  # FullBox header + entry_count=1
    stsd = _box(b"stsd", stsd_entries + _visual_sample_entry(b"avc1", transfer))
    stbl = _box(b"stbl", stsd)
    minf = _box(b"minf", stbl)
    mdia = _box(b"mdia", minf)
    trak = _box(b"trak", mdia)
    moov = _box(b"moov", trak)
    ftyp = _box(b"ftyp", b"isom" + b"\x00\x00\x02\x00" + b"isomiso2avc1mp41")
    mdat = _box(b"mdat", mdat_prefix)
    return ftyp + mdat + moov


def test_mp4_transfer_detection():
    from app.main import _mp4_transfer_characteristic

    assert _mp4_transfer_characteristic(_mp4_with_transfer(13)) == 13
    assert _mp4_transfer_characteristic(_mp4_with_transfer(1)) == 1
    assert _mp4_transfer_characteristic(b"no colr here") is None


def test_mp4_transfer_detection_ignores_colr_bytes_in_sample_data():
    # Regression: raw H.264 sample data inside mdat (which sits BEFORE moov in a
    # non-faststarted, browser-muxed mp4 — see _mp4_with_transfer) can
    # coincidentally contain the literal bytes "colr"+"nclx", which the old
    # blind-substring-search implementation would misread as a real colour tag.
    # The real tag here is 1 (Chrome/BT.709); a coincidental match in mdat must
    # not override it.
    fake_match_in_sample_data = b"colrnclx" + b"\x00" * 40
    data = _mp4_with_transfer(1, mdat_prefix=fake_match_in_sample_data)
    from app.main import _mp4_transfer_characteristic

    assert _mp4_transfer_characteristic(data) == 1


def test_retag_passes_through_non_safari():
    from app.main import _retag_bt709

    # transfer != 13 (Chrome) and no-colr both come back byte-identical, untouched.
    chrome = _mp4_with_transfer(1)
    assert _retag_bt709(chrome) == chrome
    assert _retag_bt709(b"not an mp4") == b"not an mp4"


def test_retag_degrades_gracefully_on_bad_input():
    from app.main import _retag_bt709

    # Tagged 13 but not a real mp4 (no decodable bitstream) → ffmpeg fails (or
    # is absent) → original bytes.
    garbage13 = _mp4_with_transfer(13) + b"\x00" * 32
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

    async def fake_store(s, email, code_hash, request_hash):
        now = datetime.now(timezone.utc)
        store[email] = {
            "email": email,
            "code_hash": code_hash,
            "request_hash": request_hash,
            "attempts": 0,
            "expires_at": (now + timedelta(minutes=10)).isoformat(),
            "created_at": now.isoformat(),
        }

    async def fake_bump(s, email):
        store[email]["attempts"] += 1

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
    r = c.post("/auth/signup/code", json={"email": "new@x.com"})
    assert r.status_code == 200
    req = r.json()["request"]
    assert len(sent["new@x.com"]) == 6
    # immediate resend hits the per-address cooldown
    assert c.post("/auth/signup/code", json={"email": "new@x.com"}).status_code == 429
    # a guess without the request token is rejected without burning attempts —
    # even with the right code
    r = c.post(
        "/auth/signup/verify",
        json={
            "email": "new@x.com",
            "code": sent["new@x.com"],
            "password": "Passw0rd!",
            "request": "not-the-token",
        },
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_code"
    assert store["new@x.com"]["attempts"] == 0
    # wrong code is rejected and counted
    wrong = "000000" if sent["new@x.com"] != "000000" else "000001"
    r = c.post(
        "/auth/signup/verify",
        json={"email": "new@x.com", "code": wrong, "password": "Passw0rd!", "request": req},
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
            "request": req,
        },
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_input"
    assert "new@x.com" in store
    # the right code creates the account and consumes the row
    r = c.post(
        "/auth/signup/verify",
        json={
            "email": "new@x.com",
            "code": sent["new@x.com"],
            "password": "Passw0rd!",
            "request": req,
        },
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

    async def fake_store(s, email, code_hash, request_hash):
        now = datetime.now(timezone.utc)
        store[email] = {
            "email": email,
            "code_hash": code_hash,
            "request_hash": request_hash,
            "attempts": 0,
            "expires_at": (now + timedelta(minutes=10)).isoformat(),
            "created_at": now.isoformat(),
        }

    async def fake_bump(s, email):
        store[email]["attempts"] += 1

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
    r = c.post("/auth/reset/code", json={"email": "user@x.com"})
    assert r.status_code == 200
    req = r.json()["request"]
    real_code = sent["user@x.com"]
    assert len(real_code) == 6
    # the right code with the wrong request token is rejected, attempts untouched
    r = c.post(
        "/auth/reset/check",
        json={"email": "user@x.com", "code": real_code, "request": "not-the-token"},
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_code"
    assert store["user@x.com"]["attempts"] == 0
    # /check: a wrong code is rejected and counted…
    wrong = "000000" if real_code != "000000" else "000001"
    r = c.post(
        "/auth/reset/check", json={"email": "user@x.com", "code": wrong, "request": req}
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_code"
    assert store["user@x.com"]["attempts"] == 1
    # …the right code checks out without consuming the row
    r = c.post(
        "/auth/reset/check", json={"email": "user@x.com", "code": real_code, "request": req}
    )
    assert r.status_code == 200 and r.json()["valid"] is True
    assert "user@x.com" in store and store["user@x.com"]["attempts"] == 1
    # a signup-purpose hash for the same code must not verify as a reset code
    store["user@x.com"]["code_hash"] = authcodes.hash_code(
        c.app.state.settings, "user@x.com", real_code, "signup"
    )
    r = c.post(
        "/auth/reset/verify",
        json={
            "email": "user@x.com",
            "code": real_code,
            "password": "NewPassw0rd!",
            "request": req,
        },
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_code"
    assert store["user@x.com"]["attempts"] == 2
    # restore the real (reset-purpose) hash: the right code sets the password
    store["user@x.com"]["code_hash"] = authcodes.hash_code(
        c.app.state.settings, "user@x.com", real_code, "reset"
    )
    store["user@x.com"]["attempts"] = 0
    r = c.post(
        "/auth/reset/verify",
        json={
            "email": "user@x.com",
            "code": real_code,
            "password": "NewPassw0rd!",
            "request": req,
        },
    )
    assert r.status_code == 200 and r.json()["reset"] is True
    assert passwords["uid-1"] == "NewPassw0rd!"
    assert "user@x.com" not in store


def test_account_endpoints_unconfigured_are_500():
    c = make_client()
    r = c.post(
        "/auth/password",
        json={
            "token": "t",
            "current_password": "OldPass1!",
            "new_password": "NewPass1!",
            "code": "123456",
        },
    )
    assert r.status_code == 500
    assert c.post("/auth/delete-account", json={"token": "t", "password": "x"}).status_code == 500


def test_account_flow_with_fakes(monkeypatch):
    """Change password (code to the account email) and delete account: bad
    token → 401, wrong password → 400, success calls the admin APIs; deletion
    removes data before the user."""
    from datetime import datetime, timedelta, timezone

    from app import authcodes

    passwords: dict[str, str] = {}
    calls: list[str] = []
    store: dict[str, dict] = {}
    sent: dict[str, str] = {}

    async def fake_get(s, email):
        return store.get(email)

    async def fake_store(s, email, code_hash, request_hash):
        now = datetime.now(timezone.utc)
        store[email] = {
            "email": email,
            "code_hash": code_hash,
            "request_hash": request_hash,
            "attempts": 0,
            "expires_at": (now + timedelta(minutes=10)).isoformat(),
            "created_at": now.isoformat(),
        }

    async def fake_bump(s, email):
        store[email]["attempts"] += 1

    async def fake_delete_code(s, email):
        store.pop(email, None)

    async def fake_send(s, to, code, purpose="signup"):
        sent[to] = code

    async def fake_get_token_user(s, token):
        return ("uid-1", "user@x.com") if token == "good-token" else None

    async def fake_check_password(s, email, pw):
        return pw == "RightPass1!"

    async def fake_set_password(s, uid, pw):
        passwords[uid] = pw

    async def fake_delete_data(s, uid):
        calls.append(f"data:{uid}")

    async def fake_delete_user(s, uid):
        calls.append(f"user:{uid}")

    async def fake_storage_usage(s, uid):
        return 123_456

    monkeypatch.setattr(authcodes, "get_token_user", fake_get_token_user)
    monkeypatch.setattr(authcodes, "check_password", fake_check_password)
    monkeypatch.setattr(authcodes, "set_user_password", fake_set_password)
    monkeypatch.setattr(authcodes, "delete_user_data", fake_delete_data)
    monkeypatch.setattr(authcodes, "delete_user", fake_delete_user)
    monkeypatch.setattr(authcodes, "storage_usage", fake_storage_usage)
    monkeypatch.setattr(authcodes, "get_code_row", fake_get)
    monkeypatch.setattr(authcodes, "store_code", fake_store)
    monkeypatch.setattr(authcodes, "bump_attempts", fake_bump)
    monkeypatch.setattr(authcodes, "delete_code", fake_delete_code)
    monkeypatch.setattr(authcodes, "send_code_email", fake_send)

    c = make_client(
        supabase_url="https://x.supabase.co",
        supabase_service_key="svc",
        brevo_api_key="brevo",
        auth_email_from="codes@dart.test",
    )

    # overview: bad token → 401, good token → stats
    assert c.post("/auth/overview", json={"token": "bad"}).status_code == 401
    r = c.post("/auth/overview", json={"token": "good-token"})
    assert r.status_code == 200 and r.json()["storage_bytes"] == 123_456

    # bad session token (both steps)
    r = c.post(
        "/auth/password/code", json={"token": "bad", "current_password": "RightPass1!"}
    )
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"
    # wrong current password can't even request a code
    r = c.post(
        "/auth/password/code", json={"token": "good-token", "current_password": "nope"}
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_input"
    # the code goes to the ACCOUNT email
    r = c.post(
        "/auth/password/code",
        json={"token": "good-token", "current_password": "RightPass1!"},
    )
    assert r.status_code == 200
    req = r.json()["request"]
    assert len(sent["user@x.com"]) == 6
    # new password shape enforced
    r = c.post(
        "/auth/password",
        json={
            "token": "good-token",
            "current_password": "RightPass1!",
            "new_password": "short",
            "code": sent["user@x.com"],
            "request": req,
        },
    )
    assert r.status_code == 400
    # wrong code is refused and counted
    wrong = "000000" if sent["user@x.com"] != "000000" else "000001"
    r = c.post(
        "/auth/password",
        json={
            "token": "good-token",
            "current_password": "RightPass1!",
            "new_password": "NewPass1!",
            "code": wrong,
            "request": req,
        },
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_code"
    assert store["user@x.com"]["attempts"] == 1
    # success consumes the code
    r = c.post(
        "/auth/password",
        json={
            "token": "good-token",
            "current_password": "RightPass1!",
            "new_password": "NewPass1!",
            "code": sent["user@x.com"],
            "request": req,
        },
    )
    assert r.status_code == 200 and r.json()["updated"] is True
    assert passwords["uid-1"] == "NewPass1!"
    assert "user@x.com" not in store

    # delete: wrong password refused, then success removes data before the user
    r = c.post("/auth/delete-account", json={"token": "good-token", "password": "nope"})
    assert r.status_code == 400
    r = c.post(
        "/auth/delete-account", json={"token": "good-token", "password": "RightPass1!"}
    )
    assert r.status_code == 200 and r.json()["deleted"] is True
    assert calls == ["data:uid-1", "user:uid-1"]


def test_email_change_flow_with_fakes(monkeypatch):
    """Change email: wrong password → 400; taken address → 409; the code goes
    to the NEW address and verifying it switches the account's email."""
    from datetime import datetime, timedelta, timezone

    from app import authcodes

    store: dict[str, dict] = {}
    sent: dict[str, str] = {}
    emails: dict[str, str] = {}

    async def fake_get_token_user(s, token):
        return ("uid-1", "old@x.com") if token == "good-token" else None

    async def fake_check_password(s, email, pw):
        return pw == "RightPass1!"

    async def fake_user_exists(s, email):
        return email == "taken@x.com"

    async def fake_get(s, email):
        return store.get(email)

    async def fake_store(s, email, code_hash, request_hash):
        now = datetime.now(timezone.utc)
        store[email] = {
            "email": email,
            "code_hash": code_hash,
            "request_hash": request_hash,
            "attempts": 0,
            "expires_at": (now + timedelta(minutes=10)).isoformat(),
            "created_at": now.isoformat(),
        }

    async def fake_bump(s, email):
        store[email]["attempts"] += 1

    async def fake_delete(s, email):
        store.pop(email, None)

    async def fake_send(s, to, code, purpose="signup"):
        sent[to] = code

    async def fake_set_email(s, uid, email):
        emails[uid] = email
        return "ok"

    monkeypatch.setattr(authcodes, "get_token_user", fake_get_token_user)
    monkeypatch.setattr(authcodes, "check_password", fake_check_password)
    monkeypatch.setattr(authcodes, "user_exists", fake_user_exists)
    monkeypatch.setattr(authcodes, "get_code_row", fake_get)
    monkeypatch.setattr(authcodes, "store_code", fake_store)
    monkeypatch.setattr(authcodes, "bump_attempts", fake_bump)
    monkeypatch.setattr(authcodes, "delete_code", fake_delete)
    monkeypatch.setattr(authcodes, "send_code_email", fake_send)
    monkeypatch.setattr(authcodes, "set_user_email", fake_set_email)

    c = make_client(
        supabase_url="https://x.supabase.co",
        supabase_service_key="svc",
        brevo_api_key="brevo",
        auth_email_from="codes@dart.test",
    )

    base = {"token": "good-token", "password": "RightPass1!"}
    # wrong password / same email / taken email are refused
    r = c.post("/auth/email/code", json={**base, "password": "nope", "new_email": "new@x.com"})
    assert r.status_code == 400
    r = c.post("/auth/email/code", json={**base, "new_email": "old@x.com"})
    assert r.status_code == 400
    r = c.post("/auth/email/code", json={**base, "new_email": "taken@x.com"})
    assert r.status_code == 409
    # the code goes to the new address
    r = c.post("/auth/email/code", json={**base, "new_email": "new@x.com"})
    assert r.status_code == 200
    req = r.json()["request"]
    assert len(sent["new@x.com"]) == 6
    # verifying it switches the email and consumes the row
    r = c.post(
        "/auth/email/verify",
        json={
            "token": "good-token",
            "new_email": "new@x.com",
            "code": sent["new@x.com"],
            "request": req,
        },
    )
    assert r.status_code == 200 and r.json()["updated"] is True
    assert emails["uid-1"] == "new@x.com"
    assert "new@x.com" not in store


# --- error monitoring (Sentry) gating -----------------------------------------


def test_monitoring_inert_without_dsn(monkeypatch):
    # No DSN → init is a no-op and reports inactive. This is the default for
    # local dev and CI, so nothing ever phones home there. Guard sentry_sdk.init
    # so a regression that inits anyway would fail loudly instead of hitting the
    # network.
    import app.monitoring as monitoring

    monkeypatch.setattr(monitoring, "_initialized", False)

    def _fail_init(*a, **k):  # pragma: no cover - only runs on regression
        raise AssertionError("sentry_sdk.init must not run without a DSN")

    monkeypatch.setattr("sentry_sdk.init", _fail_init)
    settings = Settings(_env_file=None, sentry_dsn=None)
    assert monitoring.init_sentry(settings) is False


def test_monitoring_health_flag_reflects_dsn(monkeypatch):
    # /health advertises whether monitoring is wired, without leaking the DSN.
    # sentry_sdk.init is stubbed so no real client/transport is created.
    import app.monitoring as monitoring

    monkeypatch.setattr(monitoring, "_initialized", False)
    inits: list[dict] = []
    monkeypatch.setattr("sentry_sdk.init", lambda **kw: inits.append(kw))

    off = make_client()
    assert off.get("/health").json()["monitoring_ready"] is False
    assert inits == []  # no DSN → init never called

    monkeypatch.setattr(monitoring, "_initialized", False)
    on = make_client(sentry_dsn="https://k@o0.ingest.sentry.io/1")
    body = on.get("/health").json()
    assert body["monitoring_ready"] is True
    # The DSN itself must never appear in the health payload.
    assert "o0.ingest.sentry.io" not in str(body)
    assert len(inits) == 1 and inits[0]["send_default_pii"] is False


def test_monitoring_before_send_drops_dart_errors():
    # Handled domain errors (4xx) must never reach Sentry — only real faults do.
    import app.monitoring as monitoring
    from app.errors import INVALID_INPUT, DartError

    dropped = monitoring._before_send(
        {"event": "x"}, {"exc_info": (DartError, DartError(INVALID_INPUT, "bad"), None)}
    )
    assert dropped is None
    kept = monitoring._before_send(
        {"event": "x"}, {"exc_info": (ValueError, ValueError("boom"), None)}
    )
    assert kept == {"event": "x"}
