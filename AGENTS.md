# Repository Guidelines

## Project Structure & Modules
- Next.js app lives in `app/` (`app/page.tsx` UI, `app/api/rankings/route.ts` API, global styles in `app/globals.css`). Tailwind is configured via `tailwind.config.js`.
- Shared logic sits in `lib/` (`lib/rankings.ts` aggregation orchestration, `lib/aggregation.ts`, vendor mapping in `lib/vendors.ts`, scrapers under `lib/scrapers/`).
- Cached Markdown snapshots for the legacy CLI live in `data/.cache/`; keep filenames date-stamped as already present.
- Legacy Typer-based CLI code is in `src/llm_metascore/` (entrypoint `cli.py`, aggregation in `core/`, fetchers in `fetch/`).

## Data Sources & Scrapers
- **Web app scrapers** (`lib/scrapers/openlm-*.ts`): fetch live data from openlm.ai (static HTML, no JS rendering)
  - `openlm-arena.ts`: Chatbot Arena overall and coding rankings
  - `openlm-swebench.ts`: SWE-bench benchmark scores
- **Legacy CLI scrapers** (`lib/scrapers/lmarena.ts`, `swebench.ts`): preserved for Python CLI compatibility.
- **Python fetchers** (`src/llm_metascore/fetch/`): 
  - `arena.py`: parses cached Markdown snapshots in `data/.cache/` for general and coding Arena scores.
  - `openlm.py`: fetches live SWE-bench rankings from openlm.ai.
- When updating web app data sources, ensure scrapers return `ModelEntry[]` with `{name, rank, source}` structure

## Build, Test, and Development Commands
- Install deps: `npm install`
- Local dev: `npm run dev` (Next.js at http://localhost:3000)
- Type check & lint: `npm run lint` (Next/ESLint, TypeScript strict)
- Production build & serve: `npm run build` then `npm run start`
- Deploy to Firebase: `npm run firebase:deploy` (requires `firebase login`)
- Legacy CLI: `pip install -e .` then `python -m llm_metascore.cli --type general|coding [--details]` (reads `data/.cache/`)

## Coding Style & Naming Conventions
- TypeScript: 2-space indentation; keep types explicit for props/return values; prefer `async/await`; use the `@/*` path alias. Keep client/server component boundaries explicit (add `'use client'` only when hooks are used).
- React: functional components, minimal state, prefer derived data in helpers under `lib/`.
- Tailwind: favor composable utility classes already used in `app/page.tsx`; avoid inline styles.
- Python: PEP8 with type hints; reuse shared helpers in `core/aggregate.py` and `core/vendors.py` instead of duplicating logic.
- Data rules: dense, tie-preserving ranks and creator filtering must stay aligned between TS (`lib/aggregation.ts`) and Python (`core/aggregate.py`); update both if logic changes.

## Testing Guidelines
- No automated test suite yet; at minimum run `npm run lint` and smoke-test `npm run dev` for UI/API changes.
- For CLI updates, run `python -m llm_metascore.cli --type general` to confirm snapshots parse. If adding tests, prefer lightweight unit tests (e.g., Node `node:test` or Python `pytest`) that cover aggregation and vendor mapping.

## Commit & Pull Request Guidelines
- Commits: concise, imperative titles (e.g., “Add Next.js web application”, “Move @types/markdown-it ...”).
- PRs: include a short summary, linked issue/goal, and local verification notes (`npm run lint`, manual smoke). Attach before/after screenshots for UI tweaks or sample JSON for API changes. Avoid committing secrets or Firebase tokens; keep `.env`-style values local.
