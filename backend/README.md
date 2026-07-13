# Dart — Backend

FastAPI service for Dart. The ad is written, designed and **rendered in the user's
browser**; the backend's job is to **persist** a finished ad and to proxy product
images. It does no video generation.

## What it does

- **`POST /save-ad`** — accepts a browser-rendered ad (the MP4 + product image + optional
  logo + metadata) and a Supabase access token. It verifies the token via Supabase's own
  `/auth/v1/user` endpoint, then uploads to Storage and writes the library row using the
  **service-role key** (the project's Storage rejects user JWTs directly). The `id` is
  sanitised and each write is scoped to the token's user. Safari's sRGB-tagged mp4s are
  losslessly re-tagged to BT.709 on the way in (needs ffmpeg; a no-op without it).
- **`GET /proxy-image?url=`** — re-serves an external product image same-origin so the
  browser can draw it onto the render canvas without tainting it. SSRF-guarded (scheme +
  host checked, redirects followed manually with every hop re-validated against
  private/loopback/link-local ranges) and streamed with a size cap.
- **`GET /store-products?url=`** — imports a store's **public** Shopify products feed (or a
  single product page's JSON-LD / OpenGraph) for batch generation. SSRF-guarded like the
  image proxy.
- **`POST /auth/signup/*` + `POST /auth/reset/*`** — signup and password reset with a
  Dart-emailed 6-digit code (Brevo). The Supabase account is created (admin API,
  pre-confirmed) **only after the signup code verifies**, so an unverified signup never
  exists; reset verifies a code the same way, then sets the new password via the admin
  API. Codes are stored hashed (purpose-scoped) with a 10-minute TTL and a 5-attempt
  cap; sign-in stays plain email+password.
- **`POST /auth/password` + `POST /auth/delete-account`** — signed-in account management
  (change password; delete the account plus its library rows and stored files). Both
  require the session token **and** a fresh password confirmation.
- **`GET /health`** — liveness, which providers are wired, whether `/save-ad` is configured,
  whether the Safari colour re-tag is ready (`video_retag_ready`), and whether signup code
  emails are configured (`signup_email_ready`).

The public endpoints (`/proxy-image`, `/store-products`, `/save-ad`, `/auth/signup/*`,
`/auth/reset/*`) are
**per-IP rate limited**, keyed on the real client from `X-Forwarded-For` (spoof-resistant).

> A legacy mock/LTX pipeline (`/jobs`, `/settings`, the `providers/` adapters and the
> in-memory `JobStore`) is retained behind the same app but is **not used by the
> shipped product**. Tests exercise it with the all-mock providers.

## Layout

```
app/
  main.py            # app factory + /save-ad, /proxy-image, /store-products, /health, colour re-tag
  auth.py            # verify_token via Supabase /auth/v1/user; require_user dependency
  authcodes.py       # auth email codes: Brevo sender, hashed code store, admin user create/update
  api/signup.py      # /auth/signup/* + /auth/reset/* (emailed-code flows)
  api/account.py     # /auth/password + /auth/delete-account (signed-in account management)
  config.py          # env-driven settings (pydantic-settings)
  errors.py          # DartError + contract error envelope
  netguard.py        # shared SSRF guard — streamed, size-capped fetch
  ratelimit.py       # in-memory per-IP sliding-window limiter
  models.py          # pydantic shapes
  store.py           # in-memory JobStore        (legacy pipeline)
  pipeline.py        # async orchestrator        (legacy pipeline)
  api/jobs.py        # /jobs routes              (legacy pipeline, auth-gated)
  api/settings.py    # /settings routes          (legacy pipeline, auth-gated)
  providers/         # scraper / script / video adapters (legacy, mock by default)
tests/               # end-to-end API tests against the mock pipeline
```

## Getting started

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

uvicorn app.main:app --reload         # http://localhost:8000  (docs at /docs)
pytest                                # the test suite, no network/keys
```

> The Safari colour re-tag calls `ffmpeg` (baked into the Docker image; installed
> separately for local dev). Without it, `/save-ad` still works — the re-tag just no-ops.

## Configuration

| Env | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL. Required for `/save-ad`; setting it also makes the legacy write endpoints require a valid login. Unset → auth disabled for local dev. |
| `SUPABASE_SERVICE_KEY` | Service-role key used by `/save-ad` for Storage + DB writes that bypass RLS. **Server-side only.** |
| `CORS_ORIGINS` | JSON array of allowed browser origins (default `["http://localhost:3000"]`). |

Auth code emails need `BREVO_API_KEY` + `AUTH_EMAIL_FROM` (a Brevo-verified
sender). Without them, `/auth/signup/*` and `/auth/reset/*` return 503 — no
accounts can be created and no passwords reset (sign-in for existing accounts
still works).

Optional tuning (sane defaults built in): `RATE_LIMIT_*` per-IP ceilings and
`VIDEO_RETAG_ENABLED`. See `../.env.example`.

The legacy provider vars (`VIDEO_PROVIDER`, `LTX_API_KEY`, `SCRAPER_PROVIDER`,
`ANTHROPIC_API_KEY`, …) only affect the unused pipeline; leave them at their mock
defaults.

## Auth

`/save-ad` requires a Supabase login: the frontend sends the user's access token (in
the multipart body), and `auth.py` validates it by calling Supabase's `/auth/v1/user`
— signing-algorithm agnostic, so it works regardless of the token format. The legacy
`/jobs` and `/settings` write routes use the same check via `require_user`. Enforced
only when `SUPABASE_URL` is set; unset locally → open for dev.
