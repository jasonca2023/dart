# Dart — Backend

FastAPI service for Dart. The ad is written, designed and **rendered in the user's
browser**; the backend's job is to **persist** a finished ad and to proxy product
images. It does no video generation.

## What it does

- **`POST /save-ad`** — accepts a browser-rendered ad (the MP4 + the product image +
  metadata) and a Supabase access token. It verifies the token via Supabase's own
  `/auth/v1/user` endpoint, then uploads the files to Storage and writes the library
  row using the **service-role key** (the project's Storage rejects user JWTs
  directly). The `id` is sanitised before it touches any Storage path.
- **`GET /proxy-image?url=`** — re-serves an external product image same-origin so the
  browser can draw it onto the render canvas without tainting it. Guarded against SSRF:
  the scheme + host are checked, and redirects are followed manually with every hop
  re-validated against private/loopback/link-local ranges.
- **`GET /health`** — liveness + which providers are wired + whether `/save-ad` is
  configured.

> A legacy mock/LTX pipeline (`/jobs`, `/settings`, the `providers/` adapters and the
> in-memory `JobStore`) is retained behind the same app but is **not used by the
> shipped product**. Tests exercise it with the all-mock providers.

## Layout

```
app/
  main.py            # app factory + /save-ad, /proxy-image, /health, SSRF guard
  auth.py            # verify_token via Supabase /auth/v1/user; require_user dependency
  config.py          # env-driven settings (pydantic-settings)
  errors.py          # DartError + contract error envelope
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
pytest                                # 9 end-to-end tests, no network/keys
```

## Configuration

| Env | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL. Required for `/save-ad`; setting it also makes the legacy write endpoints require a valid login. Unset → auth disabled for local dev. |
| `SUPABASE_SERVICE_KEY` | Service-role key used by `/save-ad` for Storage + DB writes that bypass RLS. **Server-side only.** |
| `CORS_ORIGINS` | JSON array of allowed browser origins (default `["http://localhost:3000"]`). |

The legacy provider vars (`VIDEO_PROVIDER`, `LTX_API_KEY`, `SCRAPER_PROVIDER`,
`ANTHROPIC_API_KEY`, …) only affect the unused pipeline; leave them at their mock
defaults.

## Auth

`/save-ad` requires a Supabase login: the frontend sends the user's access token (in
the multipart body), and `auth.py` validates it by calling Supabase's `/auth/v1/user`
— signing-algorithm agnostic, so it works regardless of the token format. The legacy
`/jobs` and `/settings` write routes use the same check via `require_user`. Enforced
only when `SUPABASE_URL` is set; unset locally → open for dev.
