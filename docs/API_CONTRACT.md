# Dart — API Contract

The HTTP surface between the browser app and the FastAPI backend. The ad is rendered in
the browser; the backend persists the result and proxies images.

Base URL (local dev): `http://localhost:8000`

---

## Conventions
- IDs are UUID strings; timestamps are ISO-8601 UTC.
- Errors use the [error model](#error-model) with an appropriate HTTP status.
- Money is integer **cents** (`cost_cents`); for Dart it's always `0`.

---

## `POST /save-ad` — persist a browser-rendered ad

`multipart/form-data`. Stores the rendered video + product image in Supabase Storage
and writes the library row with the service-role key, scoped to the user the token
identifies.

**Form fields**

| Field | Type | Notes |
|---|---|---|
| `video` | file | the rendered MP4 (or WebM) |
| `token` | string | the user's Supabase access token (validated via `/auth/v1/user`) |
| `id` | string | client UUID; sanitised to `[A-Za-z0-9_-]` before use in any path |
| `product_title` | string | optional |
| `target_audience` | string | optional |
| `aspect_ratio` | string | `16:9` \| `1:1` \| `4:5` \| `9:16` |
| `duration_sec` | int | 3–20 |
| `resolution` | string | `1080p` |
| `cost_cents` | int | `0` |
| `image` | file | optional product image |

**Response `200`**
```json
{ "video_url": "https://<project>.supabase.co/storage/v1/object/public/dart-videos/<uid>/<id>.mp4",
  "image_url": "https://.../img-<id>.png" }
```
`401` invalid/expired token · `500` server missing Supabase config · `502` upload failed.

---

## `GET /proxy-image?url=` — same-origin image proxy

Re-serves an external product image so the browser can draw it onto the render canvas
without tainting it. SSRF-guarded: scheme + host are validated, and redirects are
followed manually with every hop re-checked against private/loopback/link-local ranges.

**Response `200`** — the image bytes (`Content-Type: image/*`).
`400` bad/disallowed URL or non-image · `502` fetch failed.

---

## `GET /health`

```json
{ "status": "ok",
  "save_ad_ready": true,
  "providers": { "scraper": "...", "script": "...", "video": "..." } }
```

---

## Error model

```json
{ "error": { "code": "invalid_url", "message": "Image host is not allowed.", "retryable": false } }
```
Codes in use: `invalid_url`, `scrape_failed`, `unauthorized`, `not_found`, `internal`.

---

## Legacy `/jobs` + `/settings` (retained, unused by the app)

An earlier server-side pipeline (`POST /jobs`, `GET /jobs/{id}`, `GET /jobs`,
`POST /jobs/{id}/regenerate`, `POST /jobs/{id}/export`, `GET/POST /settings*`) still
exists behind the same app and is covered by tests with all-mock providers, but the
shipped product does not call it — generation and rendering happen in the browser, and
persistence goes through `/save-ad`. Those write routes require a Supabase login when
`SUPABASE_URL` is set.
