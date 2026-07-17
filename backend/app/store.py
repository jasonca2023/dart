"""In-memory job store (v1). Swap for Postgres in M3 — see docs/PRD.md §7."""

from __future__ import annotations

import uuid

from .errors import NOT_FOUND, DartError
from .models import Job, utcnow


# The store is process-memory only (legacy pipeline). Cap it so a long-running
# instance can't leak memory as jobs accumulate — evict the oldest past this.
_MAX_JOBS = 500


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._order: list[str] = []  # newest first

    def create(
        self,
        *,
        user_id: str,
        product_url: str,
        target_audience: str,
        aspect_ratio: str,
        duration_sec: int,
        resolution: str,
    ) -> Job:
        job = Job(
            id=uuid.uuid4().hex,
            user_id=user_id,
            product_url=product_url,
            target_audience=target_audience,
            aspect_ratio=aspect_ratio,
            duration_sec=duration_sec,
            resolution=resolution,
        )
        self._jobs[job.id] = job
        self._order.insert(0, job.id)
        while len(self._order) > _MAX_JOBS:
            evicted = self._order.pop()
            self._jobs.pop(evicted, None)
        return job

    def get(self, job_id: str, user_id: str) -> Job:
        # Same 404 whether the job doesn't exist or belongs to someone else —
        # a distinct "forbidden" response would confirm the id is real to a
        # caller who's just guessing/scanning ids.
        job = self._jobs.get(job_id)
        if job is None or job.user_id != user_id:
            raise DartError(NOT_FOUND, "Job not found.", status=404)
        return job

    def get_internal(self, job_id: str) -> Job:
        """Ownership-unchecked lookup for the orchestrator's own background
        task — it's advancing a job it scheduled itself, not looking one up
        on behalf of an untrusted external caller, so there's no caller
        identity to check against."""
        job = self._jobs.get(job_id)
        if job is None:
            raise DartError(NOT_FOUND, "Job not found.", status=404)
        return job

    def list(self, user_id: str) -> list[Job]:
        return [self._jobs[i] for i in self._order if self._jobs[i].user_id == user_id]

    def touch(self, job: Job) -> None:
        job.updated_at = utcnow()
