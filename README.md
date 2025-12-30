# llm-metascore

Aggregated rankings of top LLM creators (OpenAI, Google, Anthropic, xAI) from multiple live sources.

## Web Application

A Next.js web application that fetches and displays real-time rankings from:
- **General Intelligence**: LMArena (Text, Vision, Search) + Artificial Analysis (Omniscience Index, Hallucination Rate)
- **Coding**: LMArena (WebDev) + SWE-bench (Bash Only) + Artificial Analysis (LiveCodeBench, SciCode, TerminalBench, Tau2, Long Context Reasoning, IFBench)

### Setup

Install dependencies:
```bash
npm install
cd functions && npm install && cd ..
```

### Local Development

For local development, you need Firebase Admin credentials:

1. **Copy the example env file**:
   ```bash
   cp .env.local.example .env.local
   ```

2. **Get Firebase service account credentials**:
   - Go to [Firebase Console](https://console.firebase.google.com) > Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Copy the entire JSON content

3. **Add credentials to `.env.local`**:
   ```bash
   FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"llm-metascore",...}'
   ADMIN_PASSWORD=your-secure-password-here
   ```
   (Paste the Firebase JSON as a single-line string, and set a secure admin password)

4. **Run the development server**:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Note**: In production (Firebase/GCP), the app automatically uses Application Default Credentials - no env vars needed.

### Caching with Firebase

The app uses Firebase Firestore for caching rankings data:
- **Scheduled refresh**: A Cloud Function runs daily at midnight UTC to refresh all rankings
- **Cache TTL**: 24 hours
- **API fallback**: If cache is empty or expired, the API fetches fresh data directly
- **Graceful degradation**: Individual source failures don't crash the app - rankings are computed from available sources with failed/stale sources clearly flagged

To deploy Firebase Functions:
```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

### Deploy to Firebase

This app uses Next.js with API routes and Cloud Functions for scheduled data refresh.

1. **Authenticate with Firebase**:
   ```bash
   firebase login --no-localhost
   ```

2. **Deploy Firestore rules** (first time):
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Deploy everything**:
   ```bash
   npm run firebase:deploy
   ```

Firebase will automatically build and deploy your Next.js app with Cloud Functions.

**Note**: Your Firebase project must be on the Blaze (pay-as-you-go) plan to use Cloud Functions.

## Data Sources

All data is fetched live from static HTML (no headless browser required):

- **lmarena.ai/leaderboard**: Text, Vision, Search, WebDev category pages
- **artificialanalysis.ai**:
  - Omniscience Index, Hallucination Rate: /evaluations/omniscience
  - All individual coding benchmarks (LiveCodeBench, SciCode, TerminalBench, Tau2, Long Context Reasoning, IFBench): parsed from evaluation pages
- **swebench.com**: Bash Only category benchmark

### Error Handling & Resilience

The application implements robust error handling:

**Retry Logic with Exponential Backoff**:
- All HTTP requests use exponential backoff retry logic (1s → 2s → 4s with jitter)
- Automatically retries on HTTP 429 (rate limit) and 500-599 (server errors)
- Prevents thundering herd with randomized jitter

**Graceful Degradation**:
- Each data source is fetched independently with error handling
- If a source fails, rankings are computed from remaining successful sources
- API responses include per-source health status (`success`, `cached`, or `failed`)
- Failed sources fall back to cached data when available
- The app remains functional even when individual sources are temporarily unavailable

### Admin Override System

The application includes a password-protected admin panel for manual ranking adjustments at `/admin`.

**Use Cases**:
- Handle tie scenarios not captured by automated ranking
- Adjust rankings for older LLMs that perform exceptionally well on specific benchmarks
- Override both per-source ranks and final aggregated ranks

**Features**:
- Password-protected UI (set via `ADMIN_PASSWORD` environment variable)
- Override individual creator ranks in any source or aggregated ranking
- Overrides persist across automated refreshes
- Track override history with timestamps and optional reason notes

**How it Works**:
1. **Per-Source Overrides**: Applied BEFORE aggregation (e.g., set "OpenAI" to rank 1 in "lmarena:text")
2. **Aggregated Overrides**: Applied AFTER aggregation (e.g., set "Google" to rank 2 in final "coding" rankings)
3. **Persistence**: Stored in Firestore `rankings_overrides` collection
4. **Integration**: Cloud Functions and API routes automatically apply overrides during ranking computation

## Aggregation Rules

- Convert each source to best rank per creator using dense, tie‑preserving ranks; average ranks across sources.
- **Lab coverage filter**: Only include benchmarks where at least 3 of 4 labs (OpenAI, Google, Anthropic, xAI) are represented.
- Missing-in-source rank = max rank in that source + 1.
- No tie-breaks (stable sort by average rank).

Data composition:
- **General Intelligence** (5 sources):
    - LMArena: Text, Vision, Search
    - Artificial Analysis: Omniscience Index, Hallucination Rate (lower is better)
- **Coding** (8 sources):
    - LMArena: WebDev
    - SWE-bench: Bash Only
    - Artificial Analysis: LiveCodeBench, SciCode, TerminalBench, Tau2, Long Context Reasoning, IFBench

## Vendor Mapping

- OpenAI: contains `gpt` or `chatgpt`, or starts with `o<number>` (e.g., `o3`, `o4`)
- Google: contains `gemini`, `imagen`, or `veo`
- Anthropic: contains `claude`
- xAI: contains `grok`
- Else: `provider/model` prefix if present, otherwise `Other`

Note: Rankings always include exactly these four creators: OpenAI, Google, Anthropic, and xAI. Entries mapped to any other creator (including `Other`) are ignored. If a creator is missing from a given source/category, they receive the worst rank for that source (max rank + 1).

## License

MIT
