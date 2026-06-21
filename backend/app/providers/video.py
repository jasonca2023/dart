"""Video generators.

MockVideoGenerator  — returns a real, playable sample clip so the dashboard works
                      without a provider key.
KlingVideoGenerator — submits image + prompt to Kling and polls for completion with
                      bounded retries + backoff (PRD FR-10). Endpoint paths are
                      illustrative and must be confirmed (PRD open question #1).
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

from ..errors import NO_PRODUCT_IMAGE, RENDER_FAILED, DartError
from .base import VideoGenerator, VideoResult

# Public sample clip — lets the frontend exercise the full flow end-to-end.
# (The old gtv-videos-bucket samples now 403; W3C-hosted media is stable + CORS-open.)
_SAMPLE_VIDEO = "https://media.w3.org/2010/05/sintel/trailer.mp4"


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


class ClientRenderVideoGenerator(VideoGenerator):
    """No-op renderer: the browser renders the ad (Remotion, client-side) and
    uploads it to storage. The job reaches 'ready' with an empty video_url, which
    is the signal the frontend uses to render. No keys, no server compute."""

    async def generate(
        self,
        *,
        image_url: str,
        prompt: str,
        duration_sec: int,
        resolution: str,
        aspect_ratio: str,
    ) -> VideoResult:
        return VideoResult(video_url="", cost_cents=0)


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


class LtxVideoGenerator(VideoGenerator):
    """LTX Video (Lightricks) image-to-video.

    Animates the scraped product image into a short ad. The /v1 endpoint is
    synchronous and returns the mp4 bytes directly; we save them under media_dir
    and return a URL the backend serves from /media.
    """

    _ENDPOINT = "https://api.ltx.video/v1/image-to-video"
    # (aspect_ratio, resolution) -> "WxH" (ltx-2 supports 16:9 and 9:16).
    _RESOLUTION = {
        ("16:9", "1080p"): "1920x1080",
        ("16:9", "2160p"): "3840x2160",
        ("9:16", "1080p"): "1080x1920",
        ("9:16", "2160p"): "2160x3840",
    }

    def __init__(
        self,
        *,
        api_key: str,
        media_dir: Path,
        public_base_url: str,
        model: str = "ltx-2-fast",
        fps: int = 25,
        generate_audio: bool = False,
        timeout: float = 300.0,
    ) -> None:
        self.api_key = api_key
        self.media_dir = Path(media_dir)
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self.public_base_url = public_base_url.rstrip("/")
        self.model = model
        self.fps = fps
        self.generate_audio = generate_audio
        self.timeout = timeout

    async def generate(
        self,
        *,
        image_url: str,
        prompt: str,
        duration_sec: int,
        resolution: str,
        aspect_ratio: str,
    ) -> VideoResult:
        if not image_url:
            raise DartError(NO_PRODUCT_IMAGE, "No product image to animate.", status=422)

        try:
            import httpx
        except ImportError as e:  # pragma: no cover - dependency guard
            raise DartError(RENDER_FAILED, "httpx is not installed.", status=500) from e

        # LTX-2 fast renders 4K (2160p) at ≤10s; only 1080p supports the full 20s.
        max_duration = 10 if resolution == "2160p" else 20
        body = {
            "image_uri": image_url,
            "prompt": prompt,
            "model": self.model,
            "duration": min(int(duration_sec), max_duration),
            "resolution": self._RESOLUTION.get((aspect_ratio, resolution), "1920x1080"),
            "fps": self.fps,
            "generate_audio": self.generate_audio,
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(self._ENDPOINT, json=body, headers=headers)
        except Exception as e:
            raise DartError(
                RENDER_FAILED, "Could not reach the video provider.", status=502, retryable=True
            ) from e

        if resp.status_code == 402:
            raise DartError(
                RENDER_FAILED,
                f"LTX account is out of credits ({_ltx_error(resp)}). "
                "Top up at https://app.ltx.video to resume rendering.",
                status=502,
                retryable=False,
            )
        if resp.status_code != 200:
            raise DartError(
                RENDER_FAILED,
                f"Video provider error: {_ltx_error(resp)}",
                status=502,
                retryable=resp.status_code in (429, 500, 503, 504),
            )

        filename = f"{uuid4().hex}.mp4"
        (self.media_dir / filename).write_bytes(resp.content)
        return VideoResult(video_url=f"{self.public_base_url}/media/{filename}", cost_cents=0)


def _ltx_error(resp) -> str:
    try:
        data = resp.json()
        err = data.get("error", data)
        return str(err.get("message") or err)[:200]
    except Exception:
        return f"HTTP {resp.status_code}"
