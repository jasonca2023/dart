# Dart — Product Requirements Document

**Status:** Shipped v1
**Last updated:** 2026-06-29
**Owner:** @jasonca2023

> This product pivoted from its original concept (paste a product URL → an LLM script
> → a generative 4K video of a virtual human). Dart now takes a **product photo** and
> renders a **typographic/product motion ad in the browser** — no scraping, no
> generative video, no per-render cost. This document describes what shipped.

---

## 1. Overview

Dart is a one-click ad factory for e-commerce. A merchant uploads a product photo and a
few words (title, audience, price, length) and Dart returns a short, silent, **animated
product ad** — AI-written copy, the merchant's colours and logo, the real product on a
clean stage — rendered **in the browser** and saved to their library.

The wedge: the fastest free path from a product photo to a *finished* ad whose text is
always legible and whose product is always the real product — the two things generative
video still can't reliably do.

### Brain → renderer

Dart is split into a **brain** and a **renderer**, joined by a constrained `AdSpec`
contract:

```
[ Product photo + title/audience/price/duration ]
        │
        ▼
[ Brain ]   rule-based mood/palette/type/layout/pacing  +  AI-written copy  → AdSpec
        │
        ▼
[ Renderer ]  consumes the *validated* spec, draws the ad with Remotion (WebCodecs)
        │
        ▼
[ Library ]   saved to Supabase; download or hand off to TikTok / Meta / YouTube
```

Because the renderer only ever consumes a validated spec — never AI-authored code —
output is always safe and always renders. No sandbox, no eval.

---

## 2. Goals & Non-Goals

### Goals (v1)
- Product photo → a finished, downloadable ad in **one click**, free.
- **Audience-tailored** creative (six moods, distinct palette/type/layout/structure
  each), not a recoloured template.
- **On-brand:** the merchant sets an accent colour + logo once; the ad uses them.
- Everything **client-side** (render + copy) — no render farm, no per-render bill.

### Non-Goals (v1)
- Generative/photoreal video, virtual humans, or scraping a product URL.
- Voiceover / audio (ads are silent).
- Auto-publishing without review (export is an assisted handoff).
- Native mobile apps.

---

## 3. Target users

| Persona | Need | Success |
|---|---|---|
| Solo DTC founder | Can't afford a video team | Ships a usable ad in a minute, free |
| Agency creative | Volume across many SKUs | Generates per-product ads, all formats at once |
| Marketplace seller | Stand out on TikTok / Reels | Vertical, legible, on-brand product ads |

---

## 4. Core user flow

1. Sign in (Supabase). Land on the generate form.
2. Upload a product photo; set title, audience, price, one or more formats, duration.
3. A live preview shows the chosen mood; **Shuffle** for a different take.
4. Click **Generate**. In the browser: AI writes the copy, the product background is
   removed, and the ad renders to MP4 for each chosen format.
5. The finished ad(s) save to the library. Review, download the MP4, or hand off to an
   ad platform.

---

## 5. System architecture

```
dart/
├── frontend/   # Next.js (Cloudflare Workers). Brain (adSpec) + renderer (Remotion).
├── remotion/   # Standalone Remotion Studio mirror of the renderer (verification).
├── backend/    # FastAPI (Render). Saves rendered ads + proxies images.
└── docs/        # PRD, API contract
```

- **Brain** (`frontend/lib/adSpec.ts`) — pure, deterministic: inputs → `AdSpec`.
- **AI copy** (`/api/copy` Worker route → Cloudflare Workers AI) — bespoke
  kicker/hook/subhead/CTA, overlaid on the spec; falls back to rule-based templates.
- **Renderer** (`frontend/lib/remotion/ProductAd.tsx`) — scene blocks driven by the
  spec; rasterised to MP4 with `@remotion/web-renderer` (WebCodecs).
- **Background removal** (`@imgly/background-removal`) — product cutout, in-browser.
- **Backend** (`/save-ad`) — uploads the MP4 + image to Supabase Storage and writes the
  library row with the service-role key; verifies the user via Supabase auth.

---

## 6. Functional requirements

- **FR-1 Inputs.** Product photo + title + audience + price + format(s) + duration
  (3–20s). Multiple formats render and save in one pass.
- **FR-2 Brain.** Map audience/product → tone (6) → palette, font, layout
  (banded/split/editorial/statement) and scene structure. Deterministic; `Shuffle`
  varies the take.
- **FR-3 Copy.** AI-written, word-capped so nothing clips; never invents specs; falls
  back to templates when the model is unavailable.
- **FR-4 Brand kit.** Accent colour + logo, persisted locally. Logo background is
  removed (anti-aliased) and the mark is knocked out to read on any scene, revealed as
  an end-card sign-off.
- **FR-5 Render.** In-browser (WebCodecs). Formats 16:9 / 1:1 / 4:5 / 9:16, 1080p.
  Output is always valid (constrained spec).
- **FR-6 Save.** Each finished ad uploads to Storage and saves to the user's library;
  plays on any device. Requires sign-in.
- **FR-7 Export.** Download the MP4, or open an assisted handoff to TikTok / Meta /
  YouTube. No silent auto-publish.

---

## 7. Data model

```
dart_ads (Postgres, row-level secured to auth.uid())
  id              uuid          # client-generated, sanitised server-side
  user_id         uuid
  product_title   text
  product_image   text          # Supabase Storage URL
  target_audience text
  video_url       text          # Supabase Storage URL (dart-videos bucket)
  aspect_ratio    text
  duration_sec    int
  resolution      text          # "1080p"
  status          text          # "ready"
  cost_cents      int           # 0 — rendering is free
  price_cents     int           # product price in cents (nullable)
  brand_accent    text          # accent hex used for the ad (nullable)
  logo_url        text          # saved brand-logo Storage URL (nullable)
  logo_knockout   bool          # logo is a knockout-safe cutout (nullable)
  created_at      timestamptz
```

The brand kit (accent + logo) lives in browser `localStorage`, not the database.

---

## 8. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 + React 19 + Tailwind v4, on Cloudflare Workers (OpenNext) |
| Render | Remotion `@remotion/web-renderer` (WebCodecs), in-browser |
| AI copy | Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| Backend | FastAPI on Render |
| Auth / DB / Storage | Supabase (passwordless email OTP codes, Postgres `dart_ads`, `dart-videos` bucket) |

---

## 9. Non-functional

- **Cost:** $0 per ad — render and copy are client-side / free-tier; `cost_cents` is 0.
- **Privacy:** nothing leaves the browser until the user publishes; the photo is
  processed and rendered locally.
- **Compatibility:** rendering needs WebCodecs (recent Chrome / Edge / Firefox 130+ /
  Safari 26+). Safari's sRGB colour tag is normalised to BT.709 on save.
- **Security:** service-role key server-side only; the public endpoints are SSRF-guarded
  (per-redirect host validation, streamed size caps) and per-IP rate limited; `/save-ad`
  sanitises the client `id` and scopes each write to the token's user.
- **Accessibility:** `:focus-visible` rings; motion gated behind
  `prefers-reduced-motion`.

---

## 10. Future (v2+)
- Preserve full-colour brand logos (vs. flat knockout) when they already contrast.
- Per-mood scene-order variety; stronger first-3s hooks; cut-with-motion transitions.
- Optional bespoke-copy upgrade behind the same `AdSpec` contract.
