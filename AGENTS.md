# Repository Guidelines

## Project Structure & Modules
- Next.js app lives in `app/` (`app/page.tsx` UI, `app/admin/page.tsx` admin override panel, `app/api/rankings/route.ts` API, `app/api/admin/*` admin APIs, global styles in `app/globals.css`). Tailwind is configured via `tailwind.config.js`.
- Shared logic sits in `lib/` (`lib/rankings.ts` aggregation orchestration with override application, `lib/aggregation.ts` with aggregated override logic, vendor mapping in `lib/vendors.ts`, scrapers under `lib/scrapers/`, retry utility in `lib/utils/retry.ts`).
- Firebase Cloud Functions in `functions/` (`functions/src/index.ts` scheduled cache refresh with override application).

## Data Sources & Scrapers
- **All scrapers** (`lib/scrapers/*.ts`): fetch live data from static HTML/CSV (no JS rendering needed)
  - `lmarena.ts`: LMArena Text, Vision, Search, WebDev category pages (lmarena.ai/leaderboard) - uses `fetchWithRetry()`
  - `artificial-analysis.ts`: Artificial Analysis metrics (artificialanalysis.ai) - uses `fetchWithRetry()`
    - Omniscience Index, Hallucination Rate: fetched from /evaluations/omniscience page
    - GPQA Diamond: fetched from /evaluations/gpqa-diamond page
    - Individual benchmarks (LiveCodeBench, SciCode, TerminalBench, Tau2, Long Context Reasoning, IFBench): parsed from evaluation pages using regex extraction
    - **Important**: Omniscience values use the simple `"omniscience":VALUE` field, not the `"omniscience_breakdown"` nested data. The scraper checks context to skip breakdown values and uses only the main leaderboard score (range: -100 to 100).
    - Individual benchmark fields: `livecodebench`, `scicode`, `terminalbench_hard`, `tau2`, `lcr` (Long Context Reasoning), `ifbench`, `gpqa`
  - `livebench.ts`: LiveBench global average from CSV export (livebench.ai) - auto-detects most recent version from JavaScript bundle, calculates global average across all benchmarks
  - `swebench.ts`: SWE-bench Bash Only category (swebench.com) - uses `fetchWithRetry()`
- **Retry logic**: All HTTP requests use `fetchWithRetry()` (`lib/utils/retry.ts`) with exponential backoff (1s → 2s → 4s + jitter). Retries on HTTP 429 (rate limit) and 500-599 (server errors), but not on 400-428 or 430-499 client errors.
- When updating data sources, ensure scrapers return `ModelEntry[]` with `{name, rank, score?, source}` structure
- All scrapers are imported by `lib/rankings.ts` which orchestrates fetching and aggregation
- **Error handling**: `fetchAllSources()` wraps each scraper group (LMArena, AA, SWE-bench) in try-catch blocks. Failed sources return empty arrays and error details in `SourceFetchResult[]`, allowing rankings to be computed from available sources. The API route (`app/api/rankings/route.ts`) merges fresh data with cached fallbacks and returns per-source health status.

## Admin Override System
- **Admin UI**: Password-protected panel at `/admin` (`app/admin/page.tsx`) for manual ranking adjustments
- **Authentication**: Simple password check via `ADMIN_PASSWORD` environment variable; password stored in sessionStorage after validation
- **API Routes**:
  - `app/api/admin/auth/route.ts`: POST endpoint for password validation
  - `app/api/admin/overrides/route.ts`: GET/POST/DELETE for CRUD operations on overrides (requires `x-admin-password` header)
- **Data Model**: `rankings_overrides` Firestore collection stores `RankingOverride` documents with fields: `target` (SourceKey or 'aggregated:general'/'aggregated:coding'), `creatorName`, `overrideRank`, `createdAt`, `updatedAt`, `reason`
- **Override Application Flow**:
  1. Per-source overrides applied BEFORE aggregation in `applyPerSourceOverrides()` (`lib/rankings.ts`)
  2. Aggregated overrides applied AFTER aggregation in `applyAggregatedOverrides()` (`lib/aggregation.ts`)
  3. Both API route and Cloud Functions fetch overrides and apply them during ranking computation
- **Firestore Rules**: `rankings_overrides` collection is read-only for clients, write-only via admin SDK in API routes

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
- **Pre-commit workflow** (MANDATORY before committing):
  1. Run `npm run lint` to check for linting errors
  2. Run `npm run build` to verify production build succeeds
  3. Run `npm run dev` and manually test changes in browser at http://localhost:3000
  4. Test both general and coding modes if changes affect rankings
  5. Test the admin panel at http://localhost:3000/admin if admin-related changes were made
  6. Verify API endpoints work correctly (check browser console for errors)
- No automated test suite yet; manual testing is critical before commits
- For CLI updates, run `python -m llm_metascore.cli --type general` to confirm snapshots parse
- If adding tests, prefer lightweight unit tests (e.g., Node `node:test` or Python `pytest`) that cover aggregation and vendor mapping

## Commit & Pull Request Guidelines
- **Before committing**: Always follow the testing workflow above (lint, build, dev server testing)
- Commits: concise, imperative titles (e.g., "Add Next.js web application", "Move @types/markdown-it ...")
- PRs: include a short summary, linked issue/goal, and local verification notes (`npm run lint`, `npm run build`, manual testing in dev server)
- Attach before/after screenshots for UI tweaks or sample JSON for API changes
- Avoid committing secrets or Firebase tokens; keep `.env`-style values local
