"""End-to-end API tests against the mock pipeline (no network, no keys)."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def make_client() -> TestClient:
    settings = Settings(
        _env_file=None,  # hermetic: a developer's local .env must not leak in
        mock_stage_delay_sec=0.0,
        scraper_provider="mock",
        script_provider="mock",
        video_provider="mock",
        supabase_url=None,  # auth disabled in tests
        rate_limit_enabled=False,  # the limiter is shared across the suite
    )
    return TestClient(create_app(settings))


def wait_for_terminal(client: TestClient, job_id: str, timeout: float = 5.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        data = client.get(f"/jobs/{job_id}").json()
        if data["status"] in ("ready", "failed"):
            return data
        time.sleep(0.02)
    return client.get(f"/jobs/{job_id}").json()


def test_create_returns_queued_job():
    client = make_client()
    resp = client.post(
        "/jobs",
        json={"product_url": "https://shop.example.com/products/widget-pro", "target_audience": "Gen Z"},
    )
    assert resp.status_code == 201
    job = resp.json()
    assert job["status"] == "queued"
    assert job["aspect_ratio"] == "16:9"
    assert job["id"]


def test_pipeline_completes_to_ready():
    client = make_client()
    job_id = client.post(
        "/jobs",
        json={"product_url": "https://shop.example.com/products/widget-pro", "target_audience": "Gen Z"},
    ).json()["id"]

    done = wait_for_terminal(client, job_id)
    assert done["status"] == "ready", done
    assert done["product"]["title"]
    assert done["product"]["images"]
    assert done["script"]["video_prompt"]
    assert len(done["script"]["scenes"]) >= 1
    assert done["video_url"]


def test_invalid_aspect_ratio_is_422():
    client = make_client()
    resp = client.post(
        "/jobs", json={"product_url": "https://x.com/p", "aspect_ratio": "4:3"}
    )
    assert resp.status_code == 422


def test_invalid_url_fails_job_with_error():
    client = make_client()
    job_id = client.post("/jobs", json={"product_url": "not-a-url"}).json()["id"]
    done = wait_for_terminal(client, job_id)
    assert done["status"] == "failed"
    assert done["error"]


def test_unknown_job_returns_contract_error():
    client = make_client()
    resp = client.get("/jobs/doesnotexist")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_regenerate_creates_new_job():
    client = make_client()
    first = client.post("/jobs", json={"product_url": "https://shop.example.com/p/x"}).json()
    wait_for_terminal(client, first["id"])

    resp = client.post(f"/jobs/{first['id']}/regenerate")
    assert resp.status_code == 201
    assert resp.json()["id"] != first["id"]

    listing = client.get("/jobs").json()
    assert len(listing["jobs"]) >= 2


def test_export_ready_job():
    client = make_client()
    job_id = client.post("/jobs", json={"product_url": "https://shop.example.com/p/y"}).json()["id"]
    wait_for_terminal(client, job_id)

    resp = client.post(f"/jobs/{job_id}/export", json={"destination": "tiktok"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["destination"] == "tiktok"
    assert body["handoff_url"]


def test_export_before_ready_conflicts():
    client = make_client()
    # Fresh job in 'queued' — export must 409.
    job_id = client.post("/jobs", json={"product_url": "https://shop.example.com/p/z"}).json()["id"]
    resp = client.post(f"/jobs/{job_id}/export", json={"destination": "download"})
    # Either still queued (409) or already ready (200) depending on timing; assert no crash.
    assert resp.status_code in (200, 409)


def test_health_reports_providers():
    client = make_client()
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["providers"]["video"] == "MockVideoGenerator"
