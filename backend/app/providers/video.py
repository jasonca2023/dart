"""Video generators.

MockVideoGenerator  — returns a real, playable sample clip so the dashboard works
                      without a provider key.
KlingVideoGenerator — submits image + prompt to Kling and polls for completion with
                      bounded retries + backoff (PRD FR-10). Endpoint paths are
                      illustrative and must be confirmed (PRD open question #1).
"""

from __future__ import annotations

import asyncio

from ..errors import RENDER_FAILED, DartError
from .base import VideoGenerator, VideoResult

# Public sample clip — lets the frontend exercise the full flow end-to-end.
_SAMPLE_VIDEO = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"


class MockVideoGenerator(VideoGenerator):
    def __init__(self, delay: float = 0.0) -> None:
        self.delay = delay

    async def generate(
        self,
        *,
        image_url: str,
        prompt: str,
        duration_sec: int,
        resolution: str,
        aspect_ratio: str,
    ) -> VideoResult:
        if self.delay:
            await asyncio.sleep(self.delay)
        return VideoResult(video_url=_SAMPLE_VIDEO, cost_cents=0)


class KlingVideoGenerator(VideoGenerator):
    def __init__(
        self,
        *,
        api_key: str,
        api_base: str,
        timeout: float = 20.0,
        max_polls: int = 60,
        poll_interval: float = 5.0,
    ) -> None:
        self.api_key = api_key
        self.api_base = api_base
        self.timeout = timeout
        self.max_polls = max_polls
        self.poll_interval = poll_interval

    async def generate(
        self,
        *,
        image_url: str,
        prompt: str,
        duration_sec: int,
        resolution: str,
        aspect_ratio: str,
    ) -> VideoResult:
        try:
            import httpx
        except ImportError as e:  # pragma: no cover - dependency guard
            raise DartError(RENDER_FAILED, "httpx is not installed.", status=500) from e

        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {
            "input_image": image_url,
            "prompt": prompt,
            "duration": duration_sec,
            "resolution": resolution,
            "aspect_ratio": aspect_ratio,
        }

        async with httpx.AsyncClient(
            base_url=self.api_base, timeout=self.timeout, headers=headers
        ) as client:
            try:
                # NOTE: confirm the real create/status endpoints before production use.
                resp = await client.post("/v1/videos/generations", json=payload)
                resp.raise_for_status()
                created = resp.json()
            except Exception as e:
                raise DartError(
                    RENDER_FAILED, "Video provider rejected the request.", status=502, retryable=True
                ) from e

            task_id = created.get("task_id") or created.get("id")
            if not task_id:
                raise DartError(RENDER_FAILED, "Video provider returned no task id.", status=502)

            delay = self.poll_interval
            for _ in range(self.max_polls):
                await asyncio.sleep(delay)
                try:
                    status_resp = await client.get(f"/v1/videos/generations/{task_id}")
                    status_resp.raise_for_status()
                    data = status_resp.json()
                except Exception:
                    delay = min(delay * 1.5, 30.0)
                    continue

                status = str(data.get("status", "")).upper()
                if status in ("SUCCEEDED", "SUCCESS", "COMPLETED"):
                    url = data.get("video_url") or (data.get("result") or {}).get("url")
                    if not url:
                        raise DartError(RENDER_FAILED, "Render finished without a video URL.", status=502)
                    return VideoResult(video_url=url, cost_cents=0)
                if status in ("FAILED", "ERROR"):
                    raise DartError(RENDER_FAILED, "Video rendering failed.", status=502, retryable=True)

                delay = min(delay * 1.5, 30.0)  # exponential backoff

        raise DartError(RENDER_FAILED, "Video render timed out.", status=504, retryable=True)
