"""Pydantic models mirroring docs/API_CONTRACT.md.

These shapes are the seam with the frontend — change docs/API_CONTRACT.md first.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field

AspectRatio = Literal["16:9", "9:16"]
Resolution = Literal["1080p", "2160p"]
# Custom ad length in seconds. LTX's fast model tops out near 20s at 1080p, so
# we accept any whole number in [3, 20] rather than a fixed pair of presets.
Duration = Annotated[int, Field(ge=3, le=20)]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobStatus(str, Enum):
    queued = "queued"
    scraping = "scraping"
    scripting = "scripting"
    rendering = "rendering"
    ready = "ready"
    failed = "failed"


class Product(BaseModel):
    title: str
    price: Optional[int] = None  # integer cents
    currency: str = "USD"
    images: list[str] = Field(default_factory=list)
    specs: dict[str, str] = Field(default_factory=dict)
    source: str = "unknown"


class Scene(BaseModel):
    t_start: int
    t_end: int
    description: str
    camera: str


class Script(BaseModel):
    video_prompt: str
    scenes: list[Scene] = Field(default_factory=list)


class ApiError(BaseModel):
    """Structured job-failure detail (matches docs/API_CONTRACT.md § Error model)."""

    code: str
    message: str
    retryable: bool = False


class Job(BaseModel):
    id: str
    user_id: str
    status: JobStatus = JobStatus.queued
    product_url: str
    target_audience: str
    aspect_ratio: AspectRatio = "16:9"
    duration_sec: Duration = 10
    resolution: Resolution = "1080p"
    product: Optional[Product] = None
    script: Optional[Script] = None
    video_url: Optional[str] = None
    error: Optional[ApiError] = None
    cost_cents: int = 0
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# --- Request / response bodies ---


class CreateJobRequest(BaseModel):
    product_url: str
    target_audience: str = "general audience"
    aspect_ratio: AspectRatio = "16:9"
    duration_sec: Duration = 10
    resolution: Resolution = "1080p"


class ExportRequest(BaseModel):
    destination: Literal["tiktok", "meta", "youtube", "download"] = "download"


class JobListResponse(BaseModel):
    jobs: list[Job]
    next_cursor: Optional[str] = None


class ExportResponse(BaseModel):
    destination: str
    handoff_url: str
    expires_at: datetime
