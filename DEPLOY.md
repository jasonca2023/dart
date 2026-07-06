# Deploying Dart

Dart is two services plus Supabase:

- **Frontend** (Next.js) → **Cloudflare Workers** (via the OpenNext adapter). The ad
  itself renders in the visitor's browser (WebCodecs), and the ad copy runs on
  **Cloudflare Workers AI**, so there's no server-side render or LLM key.
- **Backend** (FastAPI) → **Render** (any container host works; a `backend/Dockerfile`
  is included). It's a thin service: it saves a browser-rendered ad to Supabase with
  the service-role key, and proxies product images. No video generation, no queue.
- **Supabase** → auth, the saved-ads library (Postgres `dart_ads`, row-level secured),
  and Storage (`dart-videos` bucket).

Deploy the **backend first** so you have its URL for the frontend build.

---

## 1. Backend → Render

New **Web Service** → connect the repo → **Root Directory** `backend`, **Runtime**
Docker → add the env vars below → Create. Note the `*.onrender.com` URL.

There's no `render.yaml`, so Render does **not** auto-deploy on push — redeploy with
**Manual Deploy → "Deploy latest commit"**.

**Env vars** (all server-side):

| Var | Value |
|---|---|
| `SUPABASE_URL` | your Supabase project URL, e.g. `https://<ref>.supabase.co`. **Required** for `/save-ad`, and setting it makes the write endpoints require a valid login. |
| `SUPABASE_SERVICE_KEY` | the Supabase **service-role** key. Used by `/save-ad` to upload the video/image and write the library row (Storage rejects user JWTs directly). **Secret — never expose to the browser.** |
| `CORS_ORIGINS` | JSON array including the frontend origin, e.g. `'["https://dart-frontend.YOURNAME.workers.dev"]'` |

> The legacy `VIDEO_PROVIDER` / `LTX_API_KEY` / `SCRAPER_PROVIDER` / `ANTHROPIC_API_KEY`
> vars belong to an older server-side video pipeline that the shipped app no longer
> uses. Leave them unset.

Verify: `GET https://<backend>/health` → `{"status":"ok","save_ad_ready":true,...}`.

---

## 2. Frontend → Cloudflare

Already set up: `@opennextjs/cloudflare`, `wrangler.jsonc` (with the Workers **AI**
binding for the copy route), `open-next.config.ts`, and `npm run deploy`.
`NEXT_PUBLIC_*` values are inlined at **build time**, so they must be present when the
build runs.

```bash
cd frontend
wrangler login                    # authorize Cloudflare

# build-time public env (inlined into the bundle; the anon/publishable key is browser-safe)
export NEXT_PUBLIC_API_BASE_URL=https://<backend>.onrender.com
export NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx

npm run deploy                    # OpenNext build + wrangler deploy
```

Or via the Cloudflare git integration: Workers → Create → connect the repo →
**Root directory** `frontend`, **Build command** `npm run deploy` → add the three
`NEXT_PUBLIC_*` vars as **build** environment variables.

Note the Worker URL (e.g. `https://dart-frontend.YOURNAME.workers.dev`).
Rendering needs WebCodecs, so visitors use a recent Chrome, Edge, Firefox, or Safari.

---

## 3. Wire the two together

1. Set the backend's `CORS_ORIGINS` to include the Cloudflare Worker URL; redeploy.
2. In **Supabase → Authentication → URL Configuration**, set the **Site URL** to the
   Worker URL (so email-confirmation links point at production).
3. In **Supabase Storage**, create a public **`dart-videos`** bucket, and create the
   **`dart_ads`** table with row-level security scoping rows to `auth.uid()`.

## Notes

- The backend holds no durable state: rendered ads live in Supabase Storage and the
  `dart_ads` row points at the durable public URL.
- With **zero config** the frontend still runs (a local mock drives every screen) and
  copy falls back to rule-based templates when Workers AI is unavailable.
- `.open-next/` and `.wrangler/` are build artifacts (gitignored).
