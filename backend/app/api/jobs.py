"""Job routes — implements docs/API_CONTRACT.md."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Request

from ..auth import require_user
from ..errors import CONFLICT, DartError
from ..models import (
    CreateJobRequest,
    ExportRequest,
    ExportResponse,
    Job,
    JobListResponse,
    JobStatus,
    utcnow,
)
from ..pipeline import Orchestrator
from ..ratelimit import rate_limit
from ..store import JobStore

router = APIRouter()

# Per-IP limit for the legacy job routes (shared across every app instance).
_jobs_rl = rate_limit(30, limit_attr="rate_limit_jobs_per_min")

# Assisted handoff (v1): download returns the rendered asset itself; the platform
# destinations open that platform's real ad/upload manager so the operator can
# finish posting with the file in hand. (No silent auto-publish.)
_PLATFORM_HANDOFF = {
    "tiktok": "https://ads.tiktok.com/",
    "meta": "https://business.facebook.com/adsmanager/",
    "youtube": "https://studio.youtube.com/",
}


def _store(request: Request) -> JobStore:
    return request.app.state.store


def _orchestrator(request: Request) -> Orchestrator:
    return request.app.state.orchestrator


@router.post(
    "/jobs",
    status_code=201,
    response_model=Job,
    dependencies=[Depends(_jobs_rl)],
)
async def create_job(
    body: CreateJobRequest, request: Request, user: str = Depends(require_user)
) -> Job:
    job = _store(request).create(
        user_id=user,
        product_url=body.product_url,
        target_audience=body.target_audience,
        aspect_ratio=body.aspect_ratio,
        duration_sec=body.duration_sec,
        resolution=body.resolution,
    )
    _orchestrator(request).schedule(job.id)
    return job


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(request: Request, user: str = Depends(require_user)) -> JobListResponse:
    # The in-memory store is global (every caller's jobs live in the same
    # process), so this must filter to the caller's own jobs — being signed in
    # only proves *someone* is logged in, not that they own what they're
    # asking for. (The signed-in dashboard reads from Supabase separately.)
    return JobListResponse(jobs=_store(request).list(user))


@router.get("/jobs/{job_id}", response_model=Job)
async def get_job(
    job_id: str, request: Request, user: str = Depends(require_user)
) -> Job:
    # Same reasoning as list_jobs: the store is global, so ownership has to be
    # checked per-job, not just "is someone logged in."
    return _store(request).get(job_id, user)


@router.post(
    "/jobs/{job_id}/regenerate",
    status_code=201,
    response_model=Job,
    dependencies=[Depends(_jobs_rl)],
)
async def regenerate_job(
    job_id: str, request: Request, user: str = Depends(require_user)
) -> Job:
    src = _store(request).get(job_id, user)
    job = _store(request).create(
        user_id=user,
        product_url=src.product_url,
        target_audience=src.target_audience,
        aspect_ratio=src.aspect_ratio,
        duration_sec=src.duration_sec,
        resolution=src.resolution,
    )
    _orchestrator(request).schedule(job.id)
    return job


@router.post(
    "/jobs/{job_id}/export",
    response_model=ExportResponse,
    dependencies=[Depends(_jobs_rl)],
)
async def export_job(
    job_id: str, body: ExportRequest, request: Request, user: str = Depends(require_user)
) -> ExportResponse:
    job = _store(request).get(job_id, user)
    if job.status != JobStatus.ready or not job.video_url:
        raise DartError(CONFLICT, "Job is not ready to export.", status=409)
    handoff_url = (
        job.video_url
        if body.destination == "download"
        else _PLATFORM_HANDOFF.get(body.destination, "https://app.dart.studio/")
    )
    return ExportResponse(
        destination=body.destination,
        handoff_url=handoff_url,
        expires_at=utcnow() + timedelta(hours=1),
    )
