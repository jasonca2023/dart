"""Pydantic models mirroring docs/API_CONTRACT.md.

These shapes are the seam with the frontend — change docs/API_CONTRACT.md first.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field

AspectRatio = Literal["16:9", "9:16", "1:1"]
Resolution = Literal["1080p", "2160p"]
Duration = Literal[5, 10]


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


class Job(BaseModel):
    id: str
    status: JobStatus = JobStatus.queued
    product_url: str
    target_audience: str
    aspect_ratio: AspectRatio = "16:9"
    duration_sec: Duration = 10
    resolution: Resolution = "1080p"
    product: Optional[Product] = None
    script: Optional[Script] = None
    video_url: Optional[str] = None
    error: Optional[str] = None
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
    destination: Literal["tiktok", "meta", "download"] = "download"


class JobListResponse(BaseModel):
    jobs: list[Job]
    next_cursor: Optional[str] = None


class ExportResponse(BaseModel):
    destination: str
    handoff_url: str
    expires_at: datetime
