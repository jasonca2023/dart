# Dart — API Contract

**Status:** Draft v0.1 — the seam between `backend/` and `frontend/`.

This is the **single coordination point** between the two agents. Frontend codes against
these shapes; backend implements them. Change a shape only via PR that edits *this file*
first, so both sides see it. Until backend is live, frontend mocks these responses.

Base URL (local dev): `http://localhost:8000`
Content type: `application/json`

---

## Conventions
- All IDs are UUID strings.
- All timestamps are ISO-8601 UTC.
- Errors use the shape in [Error model](#error-model) with appropriate HTTP status.
- Money is integer **cents** (`cost_cents`), with a `currency` string elsewhere.

---

## `POST /jobs` — create a generation job

Creates a job and kicks off the async pipeline. Returns immediately with `status: "queued"`.

**Request**
```json
{
  "product_url": "https://store.example.com/products/widget",
  "target_audience": "Gen Z tech enthusiasts",
  "aspect_ratio": "9:16",          // one of "16:9" | "9:16" | "1:1", default "16:9"
  "duration_sec": 10,               // one of 5 | 10, default 10
  "resolution": "2160p"             // "1080p" | "2160p", default "1080p"
}
```

**Response `201`** — a [Job](#job-object).

---

## `GET /jobs/{id}` — poll job status

Returns the current [Job](#job-object). Frontend polls this (suggested 2s interval)
until `status` is `ready` or `failed`.

**Response `200`** — a [Job](#job-object). **`404`** if unknown id.

---

## `GET /jobs` — list current user's jobs

**Response `200`**
```json
{ "jobs": [ /* Job objects, newest first */ ], "next_cursor": null }
```

---

## `POST /jobs/{id}/regenerate` — new job from same inputs

**Response `201`** — a new [Job](#job-object).

---

## `POST /jobs/{id}/export` — assisted export

**Request**
```json
{ "destination": "tiktok" }   // "tiktok" | "meta" | "download"
```

**Response `200`**
```json
{ "destination": "tiktok", "handoff_url": "https://...", "expires_at": "..." }
```

---

## Job object

```json
{
  "id": "b3f1...",
  "status": "queued",                 // queued | scraping | scripting | rendering | ready | failed
  "product_url": "https://...",
  "target_audience": "Gen Z tech enthusiasts",
  "aspect_ratio": "9:16",
  "duration_sec": 10,
  "resolution": "2160p",
  "product": {                         // null until scraping completes
    "title": "Widget Pro",
    "price": 4999,                     // integer cents
    "currency": "USD",
    "images": ["https://..."],
    "specs": { "color": "black" },
    "source": "shopify"
  },
  "script": {                          // null until scripting completes
    "video_prompt": "Cinematic product ad ...",
    "scenes": [
      { "t_start": 0, "t_end": 3, "description": "...", "camera": "pan-right" }
    ]
  },
  "video_url": null,                   // populated when status == ready
  "error": null,                       // populated when status == failed
  "cost_cents": 0,
  "created_at": "2026-06-16T12:00:00Z",
  "updated_at": "2026-06-16T12:00:00Z"
}
```

### Status lifecycle
```
queued → scraping → scripting → rendering → ready
                                     └────────────→ failed (from any stage)
```

---

## Error model

```json
{
  "error": {
    "code": "scrape_failed",          // machine-readable
    "message": "Could not resolve product data from URL.",
    "retryable": true
  }
}
```

Suggested codes: `invalid_url`, `scrape_failed`, `no_product_image`, `script_failed`,
`render_failed`, `rate_limited`, `not_found`, `internal`.

---

## Auth (placeholder)
v1 may start unauthenticated for local dev. When auth lands, all `/jobs*` routes require
a bearer token; `GET /jobs` is scoped to the token's user. Mechanism TBD in an ADR — this
section will be updated **before** the frontend wires real auth.
