# Dart

**Dart is an autonomous, one-click ad factory for e-commerce.** Paste a single product
link and Dart generates a short cinematic 4K commercial featuring a virtual human
interacting with your real product. No actors, no editing, no delays.

```
[ Product URL ] → [ Scrape / MCP ] → [ Script (LLM) ] → [ Video render ] → [ Dashboard: review & export ]
```

## Repository layout

| Path | What | Owner |
|---|---|---|
| [`backend/`](./backend) | FastAPI orchestration: scrape → script → render → jobs | backend agent (`backend` branch) |
| [`frontend/`](./frontend) | Next.js dashboard: launch, review, export | frontend agent (`frontend` branch) |
| [`docs/`](./docs) | [PRD](./docs/PRD.md) · [API contract](./docs/API_CONTRACT.md) | shared (`main`) |

## Building this with parallel agents
Two agents build Dart concurrently. The file trees never overlap, so commits stay
conflict-free. **Read [`AGENTS.md`](./AGENTS.md) first** — it defines ownership
boundaries, the branch/merge workflow, and the API contract that is the only seam
between backend and frontend.

## Setup
1. Copy `.env.example` → `.env` and fill in keys (all server-side).
2. Backend and frontend each have their own README with run commands.

See [`docs/PRD.md`](./docs/PRD.md) for goals, requirements, milestones, and open questions.
