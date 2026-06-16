# Dart — Product Requirements Document

**Status:** Draft v0.1
**Last updated:** 2026-06-16
**Owner:** @jasonca2023

---

## 1. Overview

Dart is an autonomous, one-click ad factory for e-commerce. A merchant pastes a single
product URL (Shopify, Amazon, or any product page) and Dart returns a short, cinematic
4K video commercial featuring a virtual human interacting with the merchant's real
product. No actors, no shoot, no manual editing.

The system chains four stages:

```
[ Product URL ]
      │
      ▼
[ Scraping / MCP Engine ]   → extracts images, title, price, specs
      │
      ▼
[ Script Generation (LLM) ] → multi-modal director's prompt + scene/timing plan
      │
      ▼
[ Video Generation Engine ] → renders the cinematic clip from image + prompt
      │
      ▼
[ Dashboard ]               → review, regenerate, and export to ad platforms
```

> The reference snippets shared at kickoff (FastAPI scraper, Kling wrapper, Next.js
> dashboard) are **illustrative only**. They contain known issues (incorrect API URLs,
> string-concatenated polling endpoints, a placeholder model id) and are not the
> specification. This PRD is the source of truth.

---

## 2. Goals & Non-Goals

### Goals (v1)
- Turn a single product URL into a downloadable video ad with **one click**.
- Keep the merchant in the loop with a **review-before-publish** dashboard.
- Make the pipeline **provider-agnostic** at each stage (scraper, LLM, video engine
  are swappable behind interfaces).
- Track each generation as a **persistent job** with status, cost, and artifacts.

### Non-Goals (v1)
- Multi-scene / long-form (>15s) videos.
- Fully automated publishing without human review (export is assisted, not silent).
- Custom avatar training or brand-specific fine-tuning.
- Mobile-native apps (web responsive only).
- A/B testing and live ad-performance analytics (planned v2; see §12).

---

## 3. Target Users

| Persona | Need | Success looks like |
|---|---|---|
| **Solo DTC founder** | Can't afford a video team | Ships an ad in minutes for the cost of a few API calls |
| **Agency creative** | Needs volume across many SKUs | Batches dozens of product URLs, reviews, exports |
| **Marketplace seller** | Wants to stand out on Amazon/TikTok Shop | Generates platform-native vertical video |

---

## 4. Core User Flow

1. User signs in and lands on the **dashboard**.
2. User pastes a product URL and selects a **target audience** (and optionally aspect
   ratio / duration).
3. User clicks **Generate**.
4. Backend creates a **job**, scrapes the product, generates a script, and submits the
   video render. The dashboard shows live status (`scraping → scripting → rendering →
   ready`).
5. When ready, the user **previews** the video, sees the product data and script used,
   and can **regenerate** or **export**.
6. Export hands off to an ad platform (TikTok / Meta) or downloads the file.

### Acceptance (happy path)
- A valid Shopify product URL produces a `ready` job with a playable video and the
  source image/title/price visible — end to end, without manual intervention.

---

## 5. System Architecture

Monorepo with two independently deployable apps and a shared contract:

```
dart/
├── backend/     # FastAPI service: scrape → script → render orchestration + job store
├── frontend/    # Next.js dashboard: campaign launch, review, export
├── docs/        # PRD, API contract, ADRs
└── (root)       # shared config: .gitignore, .env.example, README, AGENTS.md
```

The two apps communicate **only** through the HTTP contract in
[`docs/API_CONTRACT.md`](./API_CONTRACT.md). Neither app imports code from the other.

### Stage components (backend)
- **Scraper / MCP engine** — resolves a URL into structured product data. Implemented
  behind a `ProductScraper` interface; first implementation may call a local MCP server
  or a direct HTML/JSON-LD extractor.
- **Script generator** — multi-modal LLM call that turns product data + the first
  product image into a director's prompt and a scene/timing plan. Behind a
  `ScriptGenerator` interface.
- **Video generator** — submits image + prompt to a video model, polls for completion,
  returns a video URL. Behind a `VideoGenerator` interface (Kling is the first adapter).
- **Job orchestrator** — persists jobs, advances state, records cost and artifacts,
  exposes status for the dashboard to poll.

---

## 6. Functional Requirements

### 6.1 Scraping / MCP Engine
- **FR-1** Accept an arbitrary product URL and return `{ title, price, currency, images[], specs{}, source }`.
- **FR-2** Validate the URL and return a structured error if the page can't be resolved
  or has no usable product image.
- **FR-3** Time out gracefully (configurable, default 20s) and surface a retryable error.
- **FR-4** Never block the request thread on long scrapes — scraping runs inside the job.

### 6.2 Script Generation
- **FR-5** Generate a video prompt and a scene plan from product data + primary image,
  tailored to the selected `target_audience`.
- **FR-6** Use a current Anthropic model. **Do not** hard-code the invalid id from the
  reference snippet. Approved ids:
  - `claude-opus-4-8` (highest quality, default for script generation)
  - `claude-sonnet-4-6` (faster / cheaper option)
  - `claude-haiku-4-5-20251001` (cheapest, low-latency)
  Model id must come from config/env, not be inlined.
- **FR-7** Output must be structured (JSON), not free text, so the video stage can
  consume it deterministically.
- **FR-8** Enforce a max prompt length and sanitize product text before sending to the model.

### 6.3 Video Generation
- **FR-9** Submit `{ input_image, prompt, duration, resolution, aspect_ratio, camera_control }`
  to the configured video provider.
- **FR-10** Poll the provider's status endpoint until `SUCCEEDED` / `FAILED`, with
  bounded retries and exponential backoff (no unbounded `while True`).
- **FR-11** Persist the returned video URL/asset against the job.
- **FR-12** Support at least: durations {5s, 10s}, resolutions {1080p, 2160p},
  aspect ratios {16:9, 9:16, 1:1}.

### 6.4 Dashboard (frontend)
- **FR-13** Form: product URL + audience + (aspect ratio, duration) + Generate button.
- **FR-14** Live job status with the four-stage progress indicator.
- **FR-15** Result view: video player, the scraped product card, and the script used.
- **FR-16** Actions: **Regenerate** (new job, same inputs) and **Export**.
- **FR-17** History list of past jobs for the signed-in user.
- **FR-18** Handle and display backend error states without crashing.

### 6.5 Export / Publishing (v1 = assisted)
- **FR-19** Download the rendered file.
- **FR-20** "Export to Ads Manager" prepares a handoff (deep link / draft) to TikTok or
  Meta — **no silent auto-publish in v1**; the user confirms in the destination tool.

---

## 7. Data Model (initial)

```
Job
  id              uuid
  user_id         uuid
  product_url     text
  status          enum(queued, scraping, scripting, rendering, ready, failed)
  target_audience text
  aspect_ratio    text
  duration_sec    int
  product         jsonb   # { title, price, currency, images[], specs }
  script          jsonb   # { video_prompt, scenes[] }
  video_url       text
  error           text
  cost_cents      int
  created_at      timestamptz
  updated_at      timestamptz
```

Persistence: Postgres (Supabase is available and acceptable for v1). Rendered videos
and scraped images stored in object storage (Supabase Storage / Vercel Blob / S3 —
decision in an ADR).

---

## 8. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | Python + FastAPI | async orchestration, Pydantic models |
| LLM | Anthropic API | model id from env; see FR-6 |
| Video | Pluggable provider (Kling first) | behind `VideoGenerator` interface |
| Frontend | Next.js + TypeScript + Tailwind | App Router |
| DB | Postgres (Supabase) | jobs + auth |
| Storage | Object storage (TBD ADR) | videos + images |
| Deploy | Vercel (frontend), TBD (backend) | |

---

## 9. Non-Functional Requirements

- **Performance:** API responses (non-render) < 500ms p95. End-to-end generation is
  bounded by the video provider; dashboard must reflect progress, not hang.
- **Cost:** every job records `cost_cents` (LLM + video). Surface estimated cost before
  generation in a later phase.
- **Reliability:** any stage failure marks the job `failed` with a user-readable reason;
  no partial/zombie jobs.
- **Security:** all provider keys server-side only (`KLING_SECRET_KEY`, `ANTHROPIC_API_KEY`).
  No secret ever reaches the browser. Validate/sanitize scraped content before LLM use.
  Rate-limit generation per user.
- **Scalability:** rendering is async/queue-friendly so concurrent jobs don't block.
- **Legal/Trust:** respect target-site robots/ToS for scraping; generated humans are
  clearly synthetic; honor takedown of scraped imagery.

---

## 10. External Dependencies & Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Video provider API shape/version uncertain | Blocks render stage | Isolate behind `VideoGenerator`; confirm real endpoints & model id before coding adapter |
| Scraping breaks on JS-heavy sites | No product data | Start with JSON-LD/OpenGraph; fall back to MCP/headless browser |
| Generated humans + real product = uncanny / brand risk | Low ad quality | Prompt guardrails, regenerate flow, human review gate |
| Cost per render high | Unit economics | Per-job cost tracking, cheaper model tiers, caching scrapes |
| Scraping ToS/legal | Compliance | robots/ToS checks, user attests ownership |

---

## 11. Milestones

- **M0 — Foundation (this setup):** repo structure, PRD, API contract, env, agent
  coordination. *(done in this commit)*
- **M1 — Vertical slice:** URL → scrape (1 site type) → script → mocked render → job in
  dashboard. Stubs allowed at each boundary.
- **M2 — Real render:** integrate the video provider adapter; real 4K output.
- **M3 — Persistence & auth:** jobs in Postgres, sign-in, history.
- **M4 — Export:** download + assisted handoff to one ad platform.
- **M5 — Hardening:** cost tracking, rate limits, error UX, scraping robustness.

---

## 12. Future (v2+)
- Live ad-performance analytics and the "virality predictor" surface.
- Multi-scene / longer videos and audio/voiceover.
- Batch generation across many SKUs.
- Silent/auto publishing with platform OAuth.

---

## 13. Open Questions
1. Which video provider + exact model/version/endpoint is authoritative? (Kling assumed.)
2. Backend hosting target (Vercel functions vs. a long-running service for polling)?
3. Object storage choice (Supabase Storage vs. Vercel Blob vs. S3)?
4. Auth provider (Supabase Auth vs. Clerk)?
5. Is the MCP scraping server a real dependency we host, or do we ship a direct scraper first?

Resolve each in a short ADR under `docs/adr/` before the relevant milestone.
