# AGENTS.md — working in this repo

Orientation for anyone (human or AI) touching Dart. Dart turns a product photo into a
short, silent, animated ad: a rule-based **mood brain** plus **AI copy** produce an ad
spec, and the spec is **rendered to an MP4 in the browser** with Remotion. The backend
only persists finished ads and proxies images.

> Historical note: Dart was bootstrapped by two agents working in parallel (a `backend`
> and a `frontend` branch, joined by an HTTP contract). That split is done — everything
> now lives on `main` as one codebase.

## Repo structure

| Path | What |
|---|---|
| `frontend/` | Next.js app: the brain (`lib/adSpec.ts`), the renderer (`lib/remotion/`), AI copy route, brand kit, auth, library. Deploys to Cloudflare. |
| `remotion/` | Standalone Remotion Studio project — mirrors `frontend/lib/remotion/ProductAd.tsx` for still-render verification. |
| `backend/` | FastAPI: `/save-ad` (service-role save), `/proxy-image` (SSRF-guarded), `/health`. Deploys to Render. |
| `docs/` | [PRD](./docs/PRD.md) · [API contract](./docs/API_CONTRACT.md) |

## Conventions that matter

- **Keep the renderer mirror in sync.** `frontend/lib/remotion/ProductAd.tsx` (the
  production, in-browser renderer) and `remotion/src/ProductAd.tsx` (Studio + still
  verification) must stay identical. Edit both.
- **The renderer only consumes a validated `AdSpec`** — never AI-authored code — so
  output is always safe. New creative goes through `adSpec.ts`, not the renderer.
- **Secrets are server-side only.** Never put the Supabase service-role key (or any
  secret) in `frontend/` or commit it. Only `NEXT_PUBLIC_*` reaches the browser, and
  the Supabase publishable/anon key is browser-safe.
- **Error monitoring is env-gated.** Sentry (`backend/app/monitoring.py`,
  `frontend/lib/monitoring.ts`) stays fully inert without a DSN — no init, no network,
  no client bytes. Keep new monitoring code behind that gate; never hard-code a DSN.
- **Don't hard-code model ids** — read them from config. Current Claude ids:
  `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. Ad copy runs on
  Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
- **Verify renders without ffmpeg:** from `remotion/`,
  `npx remotion still ProductAd-genz out/frame.png --frame=90 --props=props.json`.
- **Typecheck both** `frontend/` and `remotion/` with `npx tsc --noEmit`.

## Deploy

- Frontend → Cloudflare: `cd frontend && npm run deploy`.
- Backend → Render: manual deploy from the dashboard (no `render.yaml`, no auto-deploy).

See [`DEPLOY.md`](./DEPLOY.md).
