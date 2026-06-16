"""Provider selection. Defaults to mocks; upgrades to real adapters when keys exist.

A real provider selected without its key falls back to the mock with a warning,
so the service always boots and runs.
"""

from __future__ import annotations

import logging

from ..config import Settings
from .base import ProductScraper, ScriptGenerator, VideoGenerator
from .scraper import JsonLdProductScraper, MockProductScraper
from .script import AnthropicScriptGenerator, MockScriptGenerator
from .video import KlingVideoGenerator, MockVideoGenerator

log = logging.getLogger("dart.providers")


def build_scraper(s: Settings) -> ProductScraper:
    if s.scraper_provider == "jsonld":
        return JsonLdProductScraper(timeout=s.request_timeout_sec)
    return MockProductScraper(delay=s.mock_stage_delay_sec)


def build_script_generator(s: Settings) -> ScriptGenerator:
    provider = s.script_provider
    if provider == "auto":
        provider = "anthropic" if s.anthropic_api_key else "mock"
    if provider == "anthropic":
        if not s.anthropic_api_key:
            log.warning("script_provider=anthropic but ANTHROPIC_API_KEY missing; using mock.")
            return MockScriptGenerator(delay=s.mock_stage_delay_sec)
        return AnthropicScriptGenerator(api_key=s.anthropic_api_key, model=s.script_model)
    return MockScriptGenerator(delay=s.mock_stage_delay_sec)


def build_video_generator(s: Settings) -> VideoGenerator:
    if s.video_provider == "kling":
        if not s.kling_secret_key:
            log.warning("video_provider=kling but KLING_SECRET_KEY missing; using mock.")
            return MockVideoGenerator(delay=s.mock_stage_delay_sec)
        return KlingVideoGenerator(
            api_key=s.kling_secret_key, api_base=s.kling_api_base, timeout=s.request_timeout_sec
        )
    return MockVideoGenerator(delay=s.mock_stage_delay_sec)


def build_providers(s: Settings) -> tuple[ProductScraper, ScriptGenerator, VideoGenerator]:
    return build_scraper(s), build_script_generator(s), build_video_generator(s)
