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
  store.py           # in-memory JobStore (Postgres swap in M3)
  pipeline.py        # async orchestrator: scrape -> script -> render
  api/jobs.py        # routes
  providers/         # swappable seams: scraper, script (Claude), video (Kling)
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
| Video | `VIDEO_PROVIDER=kling` + `KLING_SECRET_KEY` | Kling video API |
| Scraper | `SCRAPER_PROVIDER=jsonld` | JSON-LD / OpenGraph scraper |

A real provider selected without its key falls back to mock with a logged warning,
so the app always runs. `GET /health` reports which providers are active.
