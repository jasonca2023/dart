# Dart — API Contract

The HTTP surface between the browser app and the FastAPI backend. The ad is rendered in
the browser; the backend persists the result, proxies images, and imports store catalogues.

Base URL (local dev): `http://localhost:8000`

---

## Conventions
- IDs are UUID strings; timestamps are ISO-8601 UTC.
- Errors use the [error model](#error-model) with an appropriate HTTP status.
- Money is integer **cents**. `cost_cents` is always `0` (rendering is free); `price_cents`
  carries the merchant's product price when set.
- The public endpoints (`/proxy-image`, `/store-products`, `/save-ad`) are **per-IP rate
  limited**; over the limit returns `429 rate_limited`.

---

## `POST /save-ad` — persist a browser-rendered ad

`multipart/form-data`. Stores the rendered video + product image (+ optional logo) in
Supabase Storage and writes the library row with the service-role key, scoped to the user
the token identifies. Safari's sRGB-tagged mp4s are losslessly re-tagged to BT.709 on the
way in (needs ffmpeg on the host; a no-op otherwise).

**Form fields**

| Field | Type | Notes |
|---|---|---|
| `video` | file | the rendered MP4 (or WebM) |
| `token` | string | the user's Supabase access token (validated via `/auth/v1/user`) |
| `id` | string | client UUID; sanitised to `[A-Za-z0-9_-]` before use in any path |
| `product_title` | string | optional |
| `target_audience` | string | optional |
| `aspect_ratio` | string | `16:9` \| `1:1` \| `4:5` \| `9:16` (default `16:9`) |
| `duration_sec` | int | 3–20 (default `10`) |
| `resolution` | string | `1080p` |
| `cost_cents` | int | `0` |
| `price_cents` | int | product price in cents; `0` when none |
| `brand_accent` | string | optional hex accent used for the ad |
| `logo_knockout` | bool | whether the saved logo is a knockout-safe cutout |
| `image` | file | optional product image |
| `logo` | file | optional brand logo (best-effort; a failed logo never fails the save) |

**Response `200`**
```json
{ "video_url": "https://<project>.supabase.co/storage/v1/object/public/dart-videos/<uid>/<id>.mp4",
  "image_url": "https://.../img-<id>.png" }
```
`401` invalid/expired token · `403` the id belongs to another user · `413` upload too
large · `429` rate limited · `500` server missing Supabase config · `502` upload failed.

---

## `GET /proxy-image?url=` — same-origin image proxy

Re-serves an external product image so the browser can draw it onto the render canvas
without tainting it. SSRF-guarded: scheme + host are validated, and redirects are followed
manually with every hop re-checked against private/loopback/link-local ranges. The body is
streamed and capped (25 MB). The response is served `nosniff` with a locked-down CSP.

**Response `200`** — the image bytes (`Content-Type: image/*`).
`400` bad/disallowed URL or non-image · `429` rate limited · `502` fetch failed / too large.

---

## `GET /store-products?url=` — import a store catalogue

Pulls a merchant's **public** Shopify products feed (`/products.json`) so the app can
batch-generate an ad per product — no OAuth, no key. A product-page link (`/products/<handle>`)
imports just that product; a bare store URL imports the catalogue (up to 100). Falls back to
reading a single product page's JSON-LD / OpenGraph when it isn't a Shopify feed. SSRF-guarded
and rate limited like the image proxy.

**Response `200`**
```json
{ "products": [ { "title": "…", "image": "https://…", "price": "$45.00" } ],
  "logo": "https://…/apple-touch-icon.png" }
```
`400` missing/invalid store URL · `429` rate limited · `502` couldn't read the link.

---

## `POST /auth/signup/*` + `POST /auth/reset/*` — emailed-code auth flows

Dart emails the 6-digit codes itself (Brevo). Signup creates the Supabase account
(admin API, pre-confirmed) **only after the code verifies** — an unverified signup never
exists as an account. Password reset runs the same code flow for accounts that do exist,
then sets the new password via the admin API. Sign-in is plain Supabase email+password
and never needs a code.

**`/auth/signup/code`** `{ "email": "you@x.com" }` → `{ "sent": true }`
`400 invalid_input` bad email · `409 conflict` email already has an account ·
`429 rate_limited` per-IP limit or 60s per-address cooldown · `502` email send failed ·
`503` Brevo not configured.

**`/auth/signup/verify`** `{ "email": "...", "code": "482917", "password": "..." }` → `{ "created": true }`
`400 invalid_input` bad shape or the password fails Supabase's policy ·
`400 invalid_code` wrong/expired (5 attempts max) · `409 conflict` already exists ·
`429 rate_limited`.

**`/auth/reset/code`** `{ "email": "you@x.com" }` → `{ "sent": true }`
Same errors as signup's `/code`, except `404 not_found` when the email has no account.

**`/auth/reset/check`** `{ "email": "...", "code": "482917" }` → `{ "valid": true }`
Validates the code without consuming it (the UI only asks for a new password after
this passes). Wrong guesses count against the same 5-attempt cap as `/verify`.

**`/auth/reset/verify`** `{ "email": "...", "code": "482917", "password": "..." }` → `{ "reset": true }`
Same errors as signup's `/verify`, plus `404 not_found` when the account no longer exists.

Codes are stored hashed (peppered, purpose-scoped — a signup code can't verify as a
reset code) in `auth_codes` with a 10-minute TTL.

---

## `GET /health`

```json
{ "status": "ok",
  "save_ad_ready": true,
  "video_retag_ready": true,
  "signup_email_ready": true,
  "providers": { "scraper": "...", "script": "...", "video": "..." } }
```
`video_retag_ready` is true only when ffmpeg is present **and** the re-tag is enabled;
`signup_email_ready` when Brevo is configured (`BREVO_API_KEY` + `AUTH_EMAIL_FROM`).

---

## Error model

```json
{ "error": { "code": "invalid_url", "message": "Host is not allowed.", "retryable": false } }
```
Codes in use: `invalid_url`, `invalid_input`, `invalid_code`, `conflict`, `scrape_failed`,
`unauthorized`, `rate_limited`, `not_found`,
`internal`.

---

## Legacy `/jobs` + `/settings` (retained, unused by the app)

An earlier server-side pipeline (`POST /jobs`, `GET /jobs/{id}`, `GET /jobs`,
`POST /jobs/{id}/regenerate`, `POST /jobs/{id}/export`, `GET/POST /settings*`) still
exists behind the same app and is covered by tests with all-mock providers, but the
shipped product does not call it — generation and rendering happen in the browser, and
persistence goes through `/save-ad`. These routes require a Supabase login when
`SUPABASE_URL` is set, and are rate limited.
