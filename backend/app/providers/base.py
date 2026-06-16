"""Provider interfaces — the swappable seams of the pipeline (PRD §5)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..models import Product, Script


@dataclass
class ScriptResult:
    script: Script
    cost_cents: int = 0


@dataclass
class VideoResult:
    video_url: str
    cost_cents: int = 0


class ProductScraper(ABC):
    @abstractmethod
    async def scrape(self, url: str) -> Product:
        """Resolve a product URL into structured product data, or raise DartError."""


class ScriptGenerator(ABC):
    @abstractmethod
    async def generate(
        self,
        *,
        product: Product,
        target_audience: str,
        aspect_ratio: str,
        duration_sec: int,
    ) -> ScriptResult:
        """Produce a director's prompt + scene plan from product data."""


class VideoGenerator(ABC):
    @abstractmethod
    async def generate(
        self,
        *,
        image_url: str,
        prompt: str,
        duration_sec: int,
        resolution: str,
        aspect_ratio: str,
    ) -> VideoResult:
        """Render a video from the product image + prompt, or raise DartError."""
