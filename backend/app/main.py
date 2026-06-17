"""FastAPI application factory and entrypoint.

Run: uvicorn app.main:app --reload  (from the backend/ directory)
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.jobs import router as jobs_router
from .config import Settings, get_settings, media_root
from .errors import DartError, dart_error_handler
from .pipeline import Orchestrator
from .providers.factory import build_providers
from .store import JobStore


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=logging.INFO)

    app = FastAPI(title="Dart Backend", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    store = JobStore()
    scraper, scripter, video = build_providers(settings)

    app.state.settings = settings
    app.state.store = store
    app.state.orchestrator = Orchestrator(store, scraper, scripter, video)

    app.add_exception_handler(DartError, dart_error_handler)
    app.include_router(jobs_router)

    # Serve generated videos (LTX writes mp4s here) at /media/<file>.mp4.
    media = media_root()
    media.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=str(media)), name="media")

    @app.get("/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "providers": {
                "scraper": type(scraper).__name__,
                "script": type(scripter).__name__,
                "video": type(video).__name__,
            },
        }

    return app


app = create_app()
