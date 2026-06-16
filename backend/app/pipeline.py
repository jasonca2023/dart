"""Async job orchestrator: scrape → script → render, advancing job state.

Each job runs as a background asyncio task so POST /jobs returns immediately and
the dashboard can poll status. Any stage failure marks the job failed with a
user-readable reason — no partial/zombie jobs (PRD §9).
"""

from __future__ import annotations

import asyncio
import logging

from .errors import DartError
from .models import JobStatus
from .providers.base import ProductScraper, ScriptGenerator, VideoGenerator
from .store import JobStore

log = logging.getLogger("dart.pipeline")


class Orchestrator:
    def __init__(
        self,
        store: JobStore,
        scraper: ProductScraper,
        scripter: ScriptGenerator,
        video: VideoGenerator,
    ) -> None:
        self.store = store
        self.scraper = scraper
        self.scripter = scripter
        self.video = video
        self._tasks: set[asyncio.Task] = set()

    def schedule(self, job_id: str) -> None:
        task = asyncio.create_task(self._run(job_id))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def _advance(self, job, status: JobStatus) -> None:
        job.status = status
        self.store.touch(job)

    async def _run(self, job_id: str) -> None:
        job = self.store.get(job_id)
        try:
            self._advance(job, JobStatus.scraping)
            product = await self.scraper.scrape(job.product_url)
            job.product = product

            self._advance(job, JobStatus.scripting)
            script_result = await self.scripter.generate(
                product=product,
                target_audience=job.target_audience,
                aspect_ratio=job.aspect_ratio,
                duration_sec=job.duration_sec,
            )
            job.script = script_result.script
            job.cost_cents += script_result.cost_cents

            self._advance(job, JobStatus.rendering)
            video_result = await self.video.generate(
                image_url=product.images[0] if product.images else "",
                prompt=script_result.script.video_prompt,
                duration_sec=job.duration_sec,
                resolution=job.resolution,
                aspect_ratio=job.aspect_ratio,
            )
            job.video_url = video_result.video_url
            job.cost_cents += video_result.cost_cents

            self._advance(job, JobStatus.ready)
        except DartError as e:
            job.error = e.message
            self._advance(job, JobStatus.failed)
            log.warning("job %s failed: %s", job_id, e.message)
        except Exception:  # pragma: no cover - defensive
            job.error = "Internal error during generation."
            self._advance(job, JobStatus.failed)
            log.exception("job %s crashed", job_id)
