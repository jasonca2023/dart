"""In-memory job store (v1). Swap for Postgres in M3 — see docs/PRD.md §7."""

from __future__ import annotations

import uuid

from .errors import NOT_FOUND, DartError
from .models import Job, utcnow


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._order: list[str] = []  # newest first

    def create(
        self,
        *,
        product_url: str,
        target_audience: str,
        aspect_ratio: str,
        duration_sec: int,
        resolution: str,
    ) -> Job:
        job = Job(
            id=uuid.uuid4().hex,
            product_url=product_url,
            target_audience=target_audience,
            aspect_ratio=aspect_ratio,
            duration_sec=duration_sec,
            resolution=resolution,
        )
        self._jobs[job.id] = job
        self._order.insert(0, job.id)
        return job

    def get(self, job_id: str) -> Job:
        job = self._jobs.get(job_id)
        if job is None:
            raise DartError(NOT_FOUND, "Job not found.", status=404)
        return job

    def list(self) -> list[Job]:
        return [self._jobs[i] for i in self._order]

    def touch(self, job: Job) -> None:
        job.updated_at = utcnow()
