# Deploying Dart

Dart is two services plus Supabase:

- **Frontend** (Next.js) → **Cloudflare** (Workers, via the OpenNext adapter)
- **Backend** (FastAPI) → **a container host** (Fly.io / Render / Railway) — Cloudflare
  Workers can't run it (it writes video files to disk, runs background render jobs,
  and keeps an in-memory job store)
- **Supabase** → already cloud-hosted (auth + saved-ads library + Storage)

Deploy the **backend first** so you have its URL for the frontend.

---

## 1. Backend → Fly.io (or Render)

A `backend/Dockerfile` is included. From `backend/`:

### Fly.io
```bash
cd backend
fly launch --no-deploy            # detects the Dockerfile; pick a name e.g. dart-backend
fly secrets set \
  VIDEO_PROVIDER=ltx \
  LTX_API_KEY=ltxv_your_key \
  LTX_MODEL=ltx-2-fast \
  LTX_GENERATE_AUDIO=true \
  SCRAPER_PROVIDER=jsonld \
  PUBLIC_BASE_URL=https://dart-backend.fly.dev \
  CORS_ORIGINS='["https://dart-frontend.YOURNAME.workers.dev"]'
fly deploy
```
Note the resulting URL (e.g. `https://dart-backend.fly.dev`).

### Render (dashboard)
New **Web Service** → connect the repo → **Root Directory** `backend`, **Runtime**
Docker → add the same env vars above → Create. Note the `*.onrender.com` URL.

**Key env vars** (all server-side):

| Var | Value |
|---|---|
| `VIDEO_PROVIDER` | `ltx` |
| `LTX_API_KEY` | your LTX key (or leave unset and paste it from the in-app **LTX key** menu) |
| `SCRAPER_PROVIDER` | `jsonld` |
| `PUBLIC_BASE_URL` | the backend's own public URL — so video links resolve |
| `CORS_ORIGINS` | JSON array incl. the frontend URL, e.g. `'["https://dart-frontend.x.workers.dev"]'` |
| `ANTHROPIC_API_KEY` | optional — real Claude scripts |

---

## 2. Frontend → Cloudflare

Already set up: `@opennextjs/cloudflare`, `wrangler.jsonc`, `open-next.config.ts`, and
`npm run deploy`. `NEXT_PUBLIC_*` values are inlined at **build time**, so they must be
present when the build runs.

### Deploy from your machine
```bash
cd frontend
wrangler login                    # opens a browser to authorize Cloudflare

# build-time public env (inlined into the bundle)
export NEXT_PUBLIC_API_BASE_URL=https://dart-backend.fly.dev
export NEXT_PUBLIC_SUPABASE_URL=https://lhculyshwpvewmhlwlom.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx

npm run deploy                    # builds the Worker bundle and deploys it
```

### Or via Cloudflare git integration
Workers → Create → connect the repo → **Root directory** `frontend`, **Build command**
`npm run deploy` (or `npx opennextjs-cloudflare build` + framework deploy) → add the
three `NEXT_PUBLIC_*` vars as **build** environment variables.

Note the Worker URL (e.g. `https://dart-frontend.YOURNAME.workers.dev`).

---

## 3. Wire the two together
1. Set the backend's `CORS_ORIGINS` to include the **Cloudflare Worker URL**, and
   `PUBLIC_BASE_URL` to the **backend URL**; redeploy the backend.
2. In **Supabase → Authentication → URL Configuration**, set the **Site URL** to the
   Cloudflare Worker URL (so email-confirmation links point at production).

## Notes
- The backend's local `media/` is ephemeral — fine, because finished ads are uploaded
  to **Supabase Storage** (`dart-videos`) and the saved record uses that durable URL.
- The LTX key can live in backend env **or** be pasted at runtime from the top-bar
  **LTX key** menu (held in memory; reverts to env on restart).
- `.open-next/` and `.wrangler/` are build artifacts (gitignored).
