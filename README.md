# Dart

**Dart is a one-click ad factory for e-commerce.** Drop in a product photo, set who
it's for, and Dart writes the copy, designs an on-brand look, and renders a short,
silent, animated product ad **right in your browser** — then saves it to your library.

No video-editing, no render farm, no per-second AI-video bill. The text is always
legible and the product is always your real product — the two things generative
video still can't reliably do.

## Live

| | URL |
|---|---|
| **App** (try it) | https://dart-frontend.blink-cursor.workers.dev |
| **Backend API** | https://dart-backend-r891.onrender.com |

> Frontend on Cloudflare, backend on Render, auth + saved ads on Supabase, ad copy
> on Cloudflare Workers AI. Rendering happens **client-side (WebCodecs)**, so it needs
> a recent Chrome or Edge. The backend free tier sleeps when idle, so the first save
> after a while takes ~50s to wake.

```
                     ┌── AI copy (Cloudflare Workers AI) ──┐
[ Product photo ] ─→ │  the "brain": inputs → an Ad Spec   │ ─→ [ Render in browser ] ─→ [ Saved to your library ]
[ Title/audience ]   └── mood · palette · type · layout ───┘     (Remotion · WebCodecs)     (Supabase, per-user)
```

## How it works — brain → renderer

Dart is split into a **brain** and a **renderer**, joined by a constrained contract
called an **Ad Spec** (`frontend/lib/adSpec.ts`):

- **The brain** turns your inputs into a structured spec — mood, colour palette,
  typography, layout, scene structure, pacing and copy. It runs in two layers: a
  deterministic **rule-based generator** (audience → tone → palette/font/layout), with
  **AI-written copy** layered on top from Cloudflare Workers AI.
- **The renderer** (`frontend/lib/remotion/ProductAd.tsx`) consumes that spec and
  draws the ad with Remotion. Because it only ever reads a *validated* spec — never
  AI-authored code — the output is always safe and always renders. No sandbox, no eval.

This is what makes each ad feel tailored instead of a recoloured template, while
keeping rendering free, deterministic and entirely in the browser.

## Features

- **Audience-tailored creative.** Six moods — `luxe · energetic · playful · calm ·
  techy · bold` — each with its own palette, font pairing, layout
  (`banded · split · editorial · statement`) and scene structure, picked from your
  audience and product. Two different audiences get genuinely different ads.
- **AI copy brain.** Bespoke kicker / hook / subhead / CTA written by Cloudflare
  Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`), with word caps so nothing
  gets clipped. Falls back to rule-based templates if the model is unavailable or over
  the free allowance — the ad never blocks on it.
- **In-browser rendering.** `@remotion/web-renderer` rasterises the ad with WebCodecs.
  Nothing leaves your browser until you choose to publish — and there's no render cost.
- **Product background removal.** `@imgly/background-removal` (isnet) lifts your
  product onto a clean lit stage, all client-side.
- **Brand kit.** Set a brand accent colour and logo once (persisted in `localStorage`).
  Logos get smart background removal (colour-key, counters included) and an **adaptive
  knockout** — the mark flips to white over dark scenes and ink-black over light ones,
  so it reads on every frame.
- **Every format.** `16:9 · 1:1 · 4:5 · 9:16`, with multi-format export in one pass.
- **Shuffle.** Same inputs, a fresh palette + copy variant on demand.
- **Adjustable length.** Any duration from **3 to 20 seconds**.
- **Saved library.** Sign in and every finished ad is uploaded to Supabase Storage and
  saved to your per-user library, so it plays on any device. Download the MP4 or open a
  handoff to TikTok / Meta / YouTube.

## Stack

- **Frontend** — Next.js 15 + React 19 + Tailwind v4, deployed to **Cloudflare Workers**
  via OpenNext. Renders the ad in-browser with `@remotion/web-renderer` (WebCodecs);
  live preview via `@remotion/player`; a code-split React Three Fiber landing hero.
- **AI copy** — Cloudflare **Workers AI** through the `AI` binding (see
  `frontend/wrangler.jsonc`); served by the `POST /api/copy` route. No API key, free tier.
- **Backend** — FastAPI on **Render**. Persists each rendered ad: uploads the video +
  image to Supabase Storage and writes the library row with the **service-role key**
  (Storage rejects user JWTs directly). Also proxies product images behind an SSRF
  guard. *(A legacy mock/LTX provider pipeline + `/jobs` API is retained but unused by
  the shipped app.)*
- **Auth + storage** — Supabase email/password auth; per-user saved ads (Postgres +
  Storage, row-level secured). The backend derives the user from their Supabase token to
  scope each save.

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

Then open http://localhost:3000 in a recent **Chrome or Edge** (in-browser rendering
needs WebCodecs).

> With **zero config** the frontend runs without a backend (a local mock drives every
> screen) and without Workers AI (copy falls back to rule-based templates). To save real
> ads you need the backend URL + Supabase set (see [Configuration](#configuration)).

## Configuration

Create `frontend/.env.local`, and `.env` at the repo root for the backend. Everything is
server-side except the `NEXT_PUBLIC_*` values.

| What | Where | Notes |
|---|---|---|
| Backend URL | `frontend/.env.local`: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` | Unset → frontend uses its local mock. |
| Supabase (browser) | `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + saved-ads library (the publishable/anon key is browser-safe). |
| Supabase (backend) | `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Service-role key used by `POST /save-ad` to store the video + library row. Setting `SUPABASE_URL` also makes write endpoints require a valid login. |
| Workers AI (copy) | `frontend/wrangler.jsonc`: the `AI` binding | No key — Cloudflare provides inference on the free tier. Locally unavailable, so dev falls back to rule-based copy. |

> `.env.example` at the root documents the **legacy** server-side video pipeline
> (Anthropic script model, LTX/Kling video providers, web scraper). The shipped app
> renders client-side and doesn't need any of those keys.

## What it does

1. Upload a product image; set the title, audience, one or more formats and the duration.
2. Dart picks a mood, writes the copy, removes the product background, and renders a
   short animated ad live in your browser.
3. Sign in (Supabase) and every finished ad is **saved to your library** + uploaded to
   Storage. **Saving requires sign-in** — the backend scopes each upload to the user id
   from your Supabase token and writes through the service-role key.
4. Review page: download the MP4, or open a handoff to TikTok / Meta / YouTube.

## Repository layout

| Path | What |
|---|---|
| [`frontend/`](./frontend) | Next.js app: launch form, the Ad Spec brain (`lib/adSpec.ts`), the Remotion renderer (`lib/remotion/`), AI copy route, brand kit, auth, saved ads |
| [`backend/`](./backend) | FastAPI: saves rendered ads to Supabase (service-role) + SSRF-guarded image proxy |
| [`remotion/`](./remotion) | Standalone Remotion project for the `ProductAd` template — Studio + still-render verification (mirrors `frontend/lib/remotion/`) |
| [`docs/`](./docs) | [PRD](./docs/PRD.md) · [API contract](./docs/API_CONTRACT.md) |
| [`DEPLOY.md`](./DEPLOY.md) | Cloudflare + Render + Supabase deployment guide |

## Deploy

- **Frontend → Cloudflare:** `cd frontend && npm run deploy` (OpenNext build + Wrangler).
- **Backend → Render:** Git-connected service, deployed from the Render dashboard
  ("Deploy latest commit"). No `render.yaml` — there's no auto-deploy on push.

Full walkthrough in [`DEPLOY.md`](./DEPLOY.md).

## Development notes

- **Keep the renderer mirror in sync.** `frontend/lib/remotion/ProductAd.tsx` (the
  production, in-browser renderer) and `remotion/src/ProductAd.tsx` (the Studio /
  still-render mirror) are kept identical. Edit both.
- **Verify renders without ffmpeg.** From `remotion/`, render stills of any composition:
  `npx remotion still ProductAd-genz out/frame.png --frame=90 --props=props.json`.
- **Typecheck.** `npx tsc --noEmit` in both `frontend/` and `remotion/`.

Dart was built by two parallel agents (see [`AGENTS.md`](./AGENTS.md)); both halves now
live on `main`.

## License

[MIT](./LICENSE) © 2026 Jason Guo
