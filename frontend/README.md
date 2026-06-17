# Dart — Frontend

> **Owned by the frontend agent. Work on the `frontend` branch, only under `frontend/`.**
> See [`../AGENTS.md`](../AGENTS.md) and the API spec in [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md).

Next.js 15 + TypeScript + Tailwind v4 dashboard: **launch campaign → live status → review → export**.
Styled in a warm "parchment command terminal" system — monochrome controls on paper
surfaces, color reserved for the decorative ad-mood orbs.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the production build
```

No backend required to run. With `NEXT_PUBLIC_API_BASE_URL` unset, the app drives a
**local mock pipeline** (`lib/mock.ts`) so every screen is fully functional — jobs
advance through scrape → script → render → ready on a timer, persisted in
`localStorage`. A "Demo data" badge shows in the app chrome while mocked.

To talk to the real backend, set the base URL (only `NEXT_PUBLIC_*` reaches the browser):

```bash
# .env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

`lib/api.ts` then calls the contract endpoints in [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md)
instead of the mock — no other code changes needed.

## Routes

| Path | Screen |
|---|---|
| `/` | Marketing landing — hero, pipeline switcher, ad-mood orbs, dashboard preview |
| `/dashboard` | Launch form (URL + audience + format) and recent-ads history |
| `/jobs/[id]` | Live four-stage status, video player, scraped product, script, export |
| `/auth` | Placeholder sign-in (no real auth yet — see PRD §13 / contract Auth) |

## Layout

- `app/` — routes (App Router) + `globals.css` (the locked design tokens)
- `components/ui/` — primitives (Button, Card, Field, Orb, StatusPill, …)
- `components/site/` — marketing sections (the hero centerpiece is a code-split
  React Three Fiber scene: glass orb + orbiting motion graphics, `HeroScene.tsx`)
- `components/app/` — dashboard / job-review components
- `lib/` — `types.ts` (mirrors the contract), `api.ts`, `mock.ts`, `format.ts`, `hooks.ts`
