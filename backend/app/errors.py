"""Structured error model matching docs/API_CONTRACT.md."""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse

# Machine-readable codes (see API_CONTRACT.md § Error model).
INVALID_URL = "invalid_url"
SCRAPE_FAILED = "scrape_failed"
NO_PRODUCT_IMAGE = "no_product_image"
SCRIPT_FAILED = "script_failed"
RENDER_FAILED = "render_failed"
RATE_LIMITED = "rate_limited"
INVALID_INPUT = "invalid_input"
INVALID_CODE = "invalid_code"
NOT_FOUND = "not_found"
CONFLICT = "conflict"
UNAUTHORIZED = "unauthorized"
INTERNAL = "internal"


class DartError(Exception):
    """Domain error that serializes to the contract's error envelope."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status: int = 400,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable


def error_body(code: str, message: str, retryable: bool) -> dict:
    return {"error": {"code": code, "message": message, "retryable": retryable}}


async def dart_error_handler(_request: Request, exc: DartError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content=error_body(exc.code, exc.message, exc.retryable),
    )
