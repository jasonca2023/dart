"""Runtime configuration, loaded from environment / .env.

All provider keys are server-side only. Defaults are chosen so the app runs
end-to-end with zero configuration (everything falls back to mock providers);
set the relevant env vars to switch a stage to its real adapter.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Look for .env at the repo root (when run from backend/) or locally.
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    # --- Service ---
    backend_port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]

    # --- Provider selection ---
    # scraper: "mock" | "jsonld"
    scraper_provider: str = "mock"
    # script:  "auto" (anthropic if key present, else mock) | "mock" | "anthropic"
    script_provider: str = "auto"
    # video:   "mock" | "kling"
    video_provider: str = "mock"

    # --- LLM (script generation) ---
    anthropic_api_key: str | None = None
    # Model id is configurable per the PRD; never hard-code in source.
    script_model: str = "claude-opus-4-8"

    # --- Video provider (Kling) ---
    kling_secret_key: str | None = None
    kling_api_base: str = "https://api.klingai.com"

    # --- Scraper ---
    mcp_scraper_url: str | None = None
    request_timeout_sec: float = 20.0

    # --- Mock pacing (so the four-stage status transitions are observable) ---
    mock_stage_delay_sec: float = 0.5


@lru_cache
def get_settings() -> Settings:
    return Settings()
