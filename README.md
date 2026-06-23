# Dart

**Dart is a one-click ad factory for e-commerce.** Upload a product image and Dart
renders a short cinematic ad of your product right in the browser — then saves it
to your library.

## Live
| | URL |
|---|---|
| **App** (try it) | https://dart-frontend.blink-cursor.workers.dev |
| **Backend API** | https://dart-backend-r891.onrender.com |

> Frontend on Cloudflare, backend on Render, auth + saved ads on Supabase. Rendering
> happens client-side (WebCodecs), so it needs a recent Chrome or Edge. The backend
> free tier sleeps when idle, so the first save after a while takes ~50s to wake.

```
[ Product image ] → [ Render in browser (Remotion · WebCodecs) ] → [ Saved to your library ]
```

## Stack
- **Frontend** — Next.js 15 + React 19 + Tailwind v4; renders the ad in-browser with `@remotion/web-renderer` (WebCodecs); a code-split React Three Fiber hero.
- **Backend** — FastAPI. Persists each rendered ad: uploads the video + image to Supabase Storage and writes the library row with the **service-role key** (the project's Storage rejects user JWTs directly). Also proxies product images. *(An optional mock/LTX provider pipeline + `/jobs` API is retained but unused by the shipped app.)*
- **Auth + storage** — Supabase email/password auth; per-user saved ads (Postgres + Storage, row-level secured). The backend derives the user from their Supabase token to scope each save.

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

Then open http://localhost:3000 in a recent Chrome or Edge (in-browser rendering needs WebCodecs).

> With **zero config** the frontend can run with no backend (a local mock drives every
> screen). To save real ads you need the backend URL + Supabase set (see
> [Configuration](#configuration)).

## Configuration
Create `frontend/.env.local`, and `.env` at the repo root for the backend.
Everything is server-side except the `NEXT_PUBLIC_*` values.

| What | Where | Notes |
|---|---|---|
| Backend URL | `frontend/.env.local`: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` | Unset → frontend uses its local mock. |
| Supabase (browser) | `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + saved-ads library (the publishable key is browser-safe). |
| Supabase (backend) | `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Service-role key used by `POST /save-ad` to store the video + library row. Setting `SUPABASE_URL` also makes write endpoints require a valid login. |

## What it does
- Upload a product image, set the title, audience, format (16:9 / 9:16) and duration (**3–20s**) → Dart renders a short cinematic ad in your browser.
- Sign in (Supabase) and every finished ad is **saved to your library** and uploaded to Storage, so it plays on any device.
- **Saving requires sign-in** — the backend scopes each upload to the user id from your Supabase token and writes through the service-role key.
- Review page: download the MP4, or open a handoff to TikTok / Meta / YouTube.

## Repository layout
| Path | What |
|---|---|
| [`frontend/`](./frontend) | Next.js app: launch form, in-browser render, auth, saved ads |
| [`backend/`](./backend) | FastAPI: saves rendered ads to Supabase (service-role) + image proxy |
| [`remotion/`](./remotion) | Standalone Remotion project for the `ProductAd` template (mirrors `frontend/lib/remotion/`) |
| [`docs/`](./docs) | [PRD](./docs/PRD.md) · [API contract](./docs/API_CONTRACT.md) |

Dart was built by two parallel agents (see [`AGENTS.md`](./AGENTS.md)); both halves
now live on `main`.
