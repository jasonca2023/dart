# Dart

**Dart is a one-click ad factory for e-commerce.** Paste a product URL and Dart
scrapes the page, directs a scene, and renders a short cinematic commercial of your
real product — then saves it to your library.

```
[ Product URL ] → [ Scrape ] → [ Script (LLM) ] → [ Video render (LTX) ] → [ Review · download · export ]
```

## Stack
- **Backend** — FastAPI pipeline (scrape → script → render) with swappable providers and an in-memory job store.
- **Frontend** — Next.js 15 + React 19 + Tailwind v4; a code-split React Three Fiber hero.
- **Video** — LTX Video (Lightricks) image-to-video, with generated audio.
- **Auth + storage** — Supabase: email/password auth and per-user saved ads (Postgres + Storage, row-level secured).

## Quick start

Two processes, from the repo root.

**Backend** → http://localhost:8000
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

**Frontend** → http://localhost:3000
```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:3000.

> With **zero config** the backend runs an all-mock pipeline, and the frontend can
> even run with no backend (a local mock drives every screen). Add keys to go real.

## Configuration
Copy `.env.example` → `.env` (repo root — the backend reads it) and create
`frontend/.env.local`. Everything is server-side except the `NEXT_PUBLIC_*` values.

| What | Where | Notes |
|---|---|---|
| Video (LTX) | `.env`: `VIDEO_PROVIDER=ltx`, `LTX_API_KEY`, `LTX_MODEL=ltx-2-fast` | Or paste a key at runtime from the in-app **LTX key** menu in the top bar. |
| Scraper | `.env`: `SCRAPER_PROVIDER=jsonld` | Real JSON-LD / OpenGraph scraper. |
| Script (optional) | `.env`: `ANTHROPIC_API_KEY` | Otherwise a templated script that names the product. |
| Backend URL | `frontend/.env.local`: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` | Unset → frontend uses its local mock. |
| Supabase | `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + saved-ads library. |

## What it does
- Paste a product URL → scrape, script, and render a **3–20s** ad (16:9 / 9:16, 1080p / 4K).
- LTX renders with generated audio. Paste your LTX key from the top-bar **LTX key** menu — it's applied at runtime, no restart.
- Sign in (Supabase) and every finished ad is **saved to your library** and uploaded to Storage, so it plays on any device.
- Review page: download the MP4, or open a handoff to TikTok / Meta / YouTube.

## Repository layout
| Path | What |
|---|---|
| [`backend/`](./backend) | FastAPI orchestration: scrape → script → render → jobs + runtime settings |
| [`frontend/`](./frontend) | Next.js app: launch, live status, review, auth, saved ads |
| [`docs/`](./docs) | [PRD](./docs/PRD.md) · [API contract](./docs/API_CONTRACT.md) |

Dart was built by two parallel agents (see [`AGENTS.md`](./AGENTS.md)); both halves
now live on `main`. The `docs/API_CONTRACT.md` shapes are the seam between backend
and frontend.
