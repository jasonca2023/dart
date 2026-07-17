"""Runtime configuration, loaded from environment / .env.

All provider keys are server-side only. Defaults are chosen so the app runs
end-to-end with zero configuration (everything falls back to mock providers);
set the relevant env vars to switch a stage to its real adapter.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Look for .env at the repo root (when run from backend/) or locally.
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # --- Service ---
    backend_port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]

    # --- Rate limiting (per client IP, sliding window) ---
    # Blunts abuse of the open proxy/scrape endpoints and the save path. Disable
    # in tests / local dev with no proxy in front.
    # Ceilings are generous so a real 100-product multi-format batch (which fires
    # many proxy/save calls, but paced by slow in-browser renders) sails through,
    # while a scripted abuser doing thousands/min is still cut off.
    rate_limit_enabled: bool = True
    rate_limit_proxy_per_min: int = 120
    rate_limit_store_per_min: int = 30
    rate_limit_save_per_min: int = 60
    rate_limit_jobs_per_min: int = 30
    rate_limit_auth_per_min: int = 10

    # --- Signup email codes (Brevo) ---
    # Dart emails the 6-digit signup code itself (not Supabase), and only creates
    # the account once the code verifies — an unverified signup never exists.
    brevo_api_key: str = ""
    auth_email_from: str = ""  # a Brevo-verified sender address
    auth_email_from_name: str = "Dart"
    auth_code_ttl_sec: int = 600

    # --- Video colour normalisation ---
    # Losslessly relabel Safari's sRGB-tagged videos to BT.709 on save so they
    # don't play darker than Chrome's. Needs ffmpeg on the host; no-op without it.
    video_retag_enabled: bool = True

    # --- Provider selection ---
    # scraper: "mock" | "jsonld"
    scraper_provider: str = "mock"
    # script:  "auto" (anthropic if key present, else mock) | "mock" | "anthropic"
    script_provider: str = "auto"
    # video:   "mock" | "ltx" | "kling"
    video_provider: str = "mock"

    # --- Auth (Supabase JWT verification) ---
    # Set to the Supabase project URL to require a valid login on write endpoints.
    # Unset (local/dev) → auth is disabled and requests pass through.
    supabase_url: str | None = None
    # Service-role (admin) key for server-side Storage/DB writes that bypass RLS.
    # Used by /save-ad to persist browser-rendered ads on the user's behalf.
    supabase_service_key: str | None = None

    # --- Operator admin (runtime /settings routes) ---
    # Shared secret required by the /settings endpoints. Unset (default) →
    # those routes are disabled entirely. They mutate GLOBAL provider config,
    # so a user login must never be enough to reach them.
    settings_admin_key: str | None = None

    # --- Error monitoring (Sentry) ---
    # Unset (default) → monitoring is fully inert (no init, no network, no cost).
    # Set SENTRY_DSN in the deploy env to turn it on. traces_sample_rate stays
    # 0 by default (errors only, no performance tracing) to keep quota/cost low.
    sentry_dsn: str | None = None
    sentry_environment: str = "production"
    sentry_traces_sample_rate: float = 0.0

    # --- LLM (script generation) ---
    anthropic_api_key: str | None = None
    # Model id is configurable per the PRD; never hard-code in source.
    script_model: str = "claude-opus-4-8"

    # --- Video provider: Kling ---
    kling_secret_key: str | None = None
    kling_api_base: str = "https://api.klingai.com"

    # --- Video provider: LTX Video (Lightricks) ---
    ltx_api_key: str | None = None
    ltx_model: str = "ltx-2-fast"
    ltx_fps: int = 25  # ltx-2 models want 25fps at 1080p (24 is rejected there)
    ltx_generate_audio: bool = True  # let LTX score the clip (music + sound design)

    # Public base URL the browser uses to fetch generated videos served from /media.
    public_base_url: str = "http://localhost:8000"
    video_timeout_sec: float = 300.0

    # --- Scraper ---
    mcp_scraper_url: str | None = None
    request_timeout_sec: float = 20.0

    # --- Mock pacing (so the four-stage status transitions are observable) ---
    mock_stage_delay_sec: float = 0.5


@lru_cache
def get_settings() -> Settings:
    return Settings()


def media_root() -> Path:
    """Directory where generated videos are written and served from (/media)."""
    return Path(__file__).resolve().parent.parent / "media"
