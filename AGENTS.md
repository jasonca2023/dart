# AGENTS.md — coordination for parallel agents

This repo is built by **two agents working at the same time**. The rules below keep your
commits conflict-free. Read this before touching anything.

## Ownership map (hard boundaries)

| Path | Owner | Branch |
|---|---|---|
| `backend/**` | **Backend agent** | `backend` |
| `frontend/**` | **Frontend agent** | `frontend` |
| `docs/**`, `AGENTS.md`, `README.md`, `.gitignore`, `.env.example` | **Shared / setup** | `main` |

**Golden rule:** never edit files outside your owned path. The two owned trees do not
overlap, so two agents can commit in parallel and merge to `main` cleanly.

## Branch & merge workflow
1. Each agent works **only on its own branch** (`backend` or `frontend`), already created
   and synced to `main`.
2. Commit early and often on your branch. Push to your branch.
3. Merge into `main` via PR. Because file trees don't overlap, merges are conflict-free.
4. **Do not commit to `main` directly** and **do not touch the other agent's branch.**
5. If you discover you need a change in a shared/root file or in `docs/`, do **not** edit
   it on your feature branch. Propose it as a separate small PR to `main` so the other
   agent picks it up. This is the only synchronization point.

## The contract is the seam
- `backend/` and `frontend/` communicate **only** over the HTTP API in
  [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md).
- Neither side imports the other's code or reads the other's files.
- Need a contract change? Edit `docs/API_CONTRACT.md` first (PR to `main`), then both
  sides build to the new shape. Until backend implements an endpoint, **frontend mocks it.**

## Working agreements
- Keep secrets server-side; never put a provider key in `frontend/`. See `.env.example`.
- Don't hard-code model ids — read from env. Current Anthropic ids: `claude-opus-4-8`,
  `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`.
- The kickoff reference snippets are illustrative and buggy — follow `docs/PRD.md`, not them.
- Add a one-line entry to your app's own `README` when you add a runnable command.

## Quick start by role
- **Backend agent:** `git checkout backend`, work under `backend/`. Implement the
  endpoints in the contract. Stub the video/LLM/scraper providers behind interfaces first.
- **Frontend agent:** `git checkout frontend`, work under `frontend/`. Build the dashboard
  against the contract; mock responses until backend is live.
