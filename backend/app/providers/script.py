"""Script generators.

MockScriptGenerator      — deterministic, no API key.
AnthropicScriptGenerator — multimodal call to the Claude Messages API. Returns a
                           structured Script via the SDK's structured-output parse.
"""

from __future__ import annotations

import asyncio

from ..errors import SCRIPT_FAILED, DartError
from ..models import Product, Scene, Script
from .base import ScriptGenerator, ScriptResult

_SYSTEM = (
    "You are a creative director for short e-commerce video ads. Given a product "
    "and a target audience, produce a high-conversion cinematic scene plan in which "
    "a realistic virtual human interacts naturally with the product. Be concrete and "
    "visual. Return only the structured script."
)

# Input/output $ per 1M tokens, for per-job cost tracking (PRD §9).
_PRICES = {
    "claude-opus-4-8": (5.0, 25.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-haiku-4-5-20251001": (1.0, 5.0),
}


def _user_prompt(product: Product, audience: str, aspect_ratio: str, duration: int) -> str:
    price = f"${product.price / 100:.2f}" if product.price is not None else "n/a"
    return (
        f"Product: {product.title}\n"
        f"Price: {price} {product.currency}\n"
        f"Source: {product.source}\n"
        f"Target audience: {audience}\n"
        f"Aspect ratio: {aspect_ratio}\n"
        f"Duration: {duration} seconds\n\n"
        "Write a video_prompt (a single rich paragraph suitable for a text-to-video "
        "model) and a list of scenes that tile the full duration. Each scene needs "
        "t_start, t_end (seconds), a visual description, and a camera move."
    )


def _estimate_cost_cents(model: str, usage) -> int:
    in_rate, out_rate = _PRICES.get(model, (5.0, 25.0))
    dollars = (usage.input_tokens / 1e6) * in_rate + (usage.output_tokens / 1e6) * out_rate
    return round(dollars * 100)


class MockScriptGenerator(ScriptGenerator):
    def __init__(self, delay: float = 0.0) -> None:
        self.delay = delay

    async def generate(
        self, *, product: Product, target_audience: str, aspect_ratio: str, duration_sec: int
    ) -> ScriptResult:
        if self.delay:
            await asyncio.sleep(self.delay)
        d = duration_sec
        # Image-to-video friendly: describe camera/product motion, not a person
        # (the renderer animates the product photo).
        prompt = (
            f"Cinematic {aspect_ratio} product commercial. Slow, smooth push-in on the "
            f"{product.title} with soft studio lighting, subtle reflections and gentle parallax; "
            f"shallow depth of field, warm premium grade, tailored for {target_audience}. "
            f"Audio: upbeat modern background music with a gentle whoosh on the push-in and "
            f"crisp product sound design; no spoken voiceover."
        )
        # Split points tile the full duration with strictly increasing bounds.
        # (The old `max(2, d//3)` first cut collided with `2*d//3` at d=3–4,
        # emitting a zero-length middle scene — the contract accepts d>=3.)
        first = max(1, d // 3)
        second = max(first + 1, 2 * d // 3)
        scenes = [
            Scene(t_start=0, t_end=first, description=f"Hero reveal of {product.title}", camera="slow push-in"),
            Scene(t_start=first, t_end=second, description=f"{target_audience} using {product.title}", camera="orbit right"),
            Scene(t_start=second, t_end=d, description="Macro detail and brand beauty shot", camera="macro pan"),
        ]
        return ScriptResult(script=Script(video_prompt=prompt, scenes=scenes), cost_cents=0)


class AnthropicScriptGenerator(ScriptGenerator):
    def __init__(self, *, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    async def generate(
        self, *, product: Product, target_audience: str, aspect_ratio: str, duration_sec: int
    ) -> ScriptResult:
        try:
            import anthropic
        except ImportError as e:  # pragma: no cover - dependency guard
            raise DartError(SCRIPT_FAILED, "anthropic SDK is not installed.", status=500) from e

        content: list[dict] = [
            {"type": "text", "text": _user_prompt(product, target_audience, aspect_ratio, duration_sec)}
        ]
        if product.images:
            content.append({"type": "image", "source": {"type": "url", "url": product.images[0]}})

        try:
            # Context-managed so the SDK's connection pool is closed per call
            # instead of leaking one pool per job.
            async with anthropic.AsyncAnthropic(api_key=self.api_key) as client:
                resp = await client.messages.parse(
                    model=self.model,
                    max_tokens=2000,
                    system=_SYSTEM,
                    messages=[{"role": "user", "content": content}],
                    output_format=Script,
                )
        except Exception as e:
            raise DartError(
                SCRIPT_FAILED, "Script generation failed.", status=502, retryable=True
            ) from e

        script = resp.parsed_output
        if script is None:
            raise DartError(
                SCRIPT_FAILED, "Model did not return a valid script.", status=502, retryable=True
            )
        return ScriptResult(script=script, cost_cents=_estimate_cost_cents(self.model, resp.usage))
