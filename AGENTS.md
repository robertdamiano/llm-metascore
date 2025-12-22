# Repository Guidelines

## Project Structure & Modules
- Next.js app lives in `app/` (`app/page.tsx` UI, `app/api/rankings/route.ts` API, global styles in `app/globals.css`). Tailwind is configured via `tailwind.config.js`.
- Shared logic sits in `lib/` (`lib/rankings.ts` aggregation orchestration, `lib/aggregation.ts`, vendor mapping in `lib/vendors.ts`, scrapers under `lib/scrapers/`).
- Firebase Cloud Functions in `functions/` (`functions/src/index.ts` scheduled cache refresh).

## Data Sources & Scrapers
- **All scrapers** (`lib/scrapers/*.ts`): fetch live data from static HTML (no JS rendering needed)
  - `openlm-arena.ts`: OpenLM.ai Arena Elo, Coding, Vision, AAII, MMLU-Pro, ARC-AGI
  - `openlm-swebench.ts`: OpenLM.ai SWE-bench and IOI benchmarks
  - `lmarena.ts`: LMArena Text, Vision, Search, WebDev categories
  - `vals.ts`: Vals.ai Vibe Code benchmark (top 3 models only)
- When updating data sources, ensure scrapers return `ModelEntry[]` with `{name, rank, score?, source}` structure
- All scrapers are imported by `lib/rankings.ts` which orchestrates fetching and aggregation

## Build, Test, and Development Commands
- Install deps: `npm install` (root) and `cd functions && npm install` (functions)
- Local dev: `npm run dev` (Next.js at http://localhost:3000)
- Type check & lint: `npm run lint` (Next/ESLint, TypeScript strict)
- Production build & serve: `npm run build` then `npm run start`
- Deploy to Firebase: `npm run firebase:deploy` (requires `firebase login`)
- Deploy functions only: `firebase deploy --only functions`
- Deploy Firestore rules: `firebase deploy --only firestore:rules`

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
