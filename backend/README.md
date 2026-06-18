# Dart — Backend

> **Owned by the backend agent. Work on the `backend` branch, only under `backend/`.**
> See [`../AGENTS.md`](../AGENTS.md) and the API spec in [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md).

FastAPI service that orchestrates the pipeline: **scrape → script → render → job store**.

## Scope
- Implement the endpoints in `docs/API_CONTRACT.md`.
- Keep each stage behind an interface so providers are swappable:
  `ProductScraper`, `ScriptGenerator`, `VideoGenerator`.
- All provider keys are server-side (see `../.env.example`). Read model ids from env.

## Layout
```
app/
  main.py            # FastAPI app factory + entrypoint
  config.py          # env-driven settings (provider selection, keys, model id)
  models.py          # Pydantic shapes mirroring docs/API_CONTRACT.md
  errors.py          # DartError + contract error envelope
  auth.py            # Supabase JWT verification (require_user dependency)
  store.py           # in-memory JobStore (Postgres swap in M3)
  pipeline.py        # async orchestrator: scrape -> script -> render
  api/jobs.py        # job routes (write routes require login)
  api/settings.py    # runtime LTX key: GET /settings, POST /settings/ltx-key (auth)
  providers/         # swappable seams: scraper, script (Claude), video (LTX/Kling)
tests/               # end-to-end API tests against the mock pipeline
```

## Getting started
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

# Run the API (zero config = all-mock pipeline, runs end-to-end)
uvicorn app.main:app --reload         # http://localhost:8000  (docs at /docs)

# Run tests
pytest
```

## Providers
Each stage runs a **mock** by default so the service boots with no keys. Switch a
stage to its real adapter by copying `../.env.example` → `../.env` and setting:

| Stage | Env | Real adapter |
|---|---|---|
| Script | `ANTHROPIC_API_KEY` (+ `SCRIPT_MODEL`) | Claude Messages API (`claude-opus-4-8`) |
| Video | `VIDEO_PROVIDER=ltx` + `LTX_API_KEY` (`LTX_MODEL=ltx-2-fast`) | LTX Video image-to-video, with audio (`kling` adapter also present) |
| Scraper | `SCRAPER_PROVIDER=jsonld` | JSON-LD / OpenGraph scraper |

A real provider selected without its key falls back to mock with a logged warning,
so the app always runs. `GET /health` reports which providers are active.

The LTX key can also be set **at runtime** — `POST /settings/ltx-key {"api_key": "..."}`
rebuilds the video provider in place (the in-app "LTX key" menu uses this). The key
is held in memory only and reverts to `.env` on restart.

## Auth
Write endpoints (`POST /jobs`, regenerate, export, `POST /settings/ltx-key`) require a
valid **Supabase login**. The frontend sends the user's access token as
`Authorization: Bearer <token>`; `auth.py` verifies its ES256 signature against the
project's JWKS. Enforced only when **`SUPABASE_URL`** is set (e.g. the deployed
backend); unset locally → endpoints are open for dev. Reads (`/health`, `GET /jobs`,
`GET /settings`) stay public.
