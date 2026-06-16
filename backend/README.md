# Dart — Backend

> **Owned by the backend agent. Work on the `backend` branch, only under `backend/`.**
> See [`../AGENTS.md`](../AGENTS.md) and the API spec in [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md).

FastAPI service that orchestrates the pipeline: **scrape → script → render → job store**.

## Scope
- Implement the endpoints in `docs/API_CONTRACT.md`.
- Keep each stage behind an interface so providers are swappable:
  `ProductScraper`, `ScriptGenerator`, `VideoGenerator`.
- All provider keys are server-side (see `../.env.example`). Read model ids from env.

## Getting started
_To be filled in by the backend agent (e.g. `uvicorn app.main:app --reload`)._
