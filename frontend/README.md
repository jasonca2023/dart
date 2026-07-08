# Dart — Frontend

Next.js 15 + React 19 + TypeScript + Tailwind v4, deployed to **Cloudflare Workers**
(OpenNext). This is where the whole ad gets made: a **rule-based mood brain** plus
**AI copy** turn the inputs into an ad spec, and the spec is **rendered to an MP4 in
the browser** with Remotion (`@remotion/web-renderer`, WebCodecs). Styled in a warm
"parchment command terminal" system — monochrome controls on paper, colour reserved
for the ad-mood orbs.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000  (rendering needs a recent Chrome/Edge/Firefox/Safari)
npm run build    # production build
npm run deploy   # OpenNext build + deploy to Cloudflare
```

No backend required to run: with `NEXT_PUBLIC_API_BASE_URL` unset, saving is a no-op
and the dashboard's library uses a local mock. Copy generation calls the `/api/copy`
Worker route (Cloudflare Workers AI); when that's unavailable it falls back to the
rule-based templates in `lib/adSpec.ts`, so previews always work.

To save real ads, set the backend URL + Supabase (`NEXT_PUBLIC_*` is the only env that
reaches the browser; the publishable/anon key is browser-safe):

```bash
# .env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

Signing in then saves every finished ad to the user's library (Supabase Postgres +
Storage, row-level secured) via the backend's `/save-ad`.

## How an ad is made

1. `lib/adSpec.ts` — the **brain**: inputs → an `AdSpec` (mood, palette, type, layout,
   scene structure, pacing, copy). Rule-based and deterministic; six moods.
2. `lib/copy.ts` + `app/api/copy/route.ts` — **AI copy** from Workers AI, overlaid on
   the spec (falls back to templates).
3. `lib/bgRemove.ts` / `lib/logo.ts` — in-browser product + logo background removal.
4. `lib/remotion/ProductAd.tsx` — the **renderer**: consumes the validated spec and
   draws the ad. `lib/render.ts` rasterises it to an MP4 with WebCodecs.
5. `lib/ads.ts` — sends the MP4 + image to the backend, which saves it to the library.

> `lib/remotion/ProductAd.tsx` is mirrored by `../remotion/src/ProductAd.tsx` (the
> standalone Remotion Studio project, used for still-render verification). Edit both.

## Routes

| Path | Screen |
|---|---|
| `/` | Signed-out: marketing landing. Signed-in: the generate form (photo · title · audience · price · formats · duration). |
| `/ads` | Your saved-ads library. |
| `/jobs/[id]` | Review a saved ad: player, download, edit, hand off to TikTok / Meta / YouTube. |
| `/auth` | Email + password sign-in; new accounts confirm with a 6-digit emailed code. |
| `/dashboard` | Legacy path — redirects to `/`. |
| `/api/copy` | Worker route: Cloudflare Workers AI writes the ad copy. |

## Layout

- `app/` — routes (App Router) + `globals.css` (the locked design tokens) + `icon.svg`
- `components/ui/` — primitives (Button, Card, Field, Orb, StatusPill, Logo, …)
- `components/site/` — marketing sections (the hero centrepiece is a code-split React
  Three Fiber scene, `HeroScene.tsx`)
- `components/app/` — the generate form, preview, review and library components
- `lib/` — `adSpec.ts` (the brain), `remotion/` (the renderer + fonts), `copy.ts`,
  `render.ts`, `bgRemove.ts`, `logo.ts`, `brand.ts`, `ads.ts`, `supabase.ts` + `auth.tsx`,
  `types.ts`, `format.ts`, `hooks.ts`, `mock.ts`
