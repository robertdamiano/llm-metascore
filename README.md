# llm-metascore

Aggregated rankings of top LLM creators (OpenAI, Google, Anthropic, xAI) from multiple live sources.

## Web Application

A Next.js web application that fetches and displays real-time rankings from:
- **General**: LMArena general leaderboards
- **Coding**: LMArena coding + SWE Bench bash-only
- **Top Apps**: OpenRouter top apps (this week)

### Setup

Install dependencies:
```bash
npm install
```

### Development

Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Deploy to Firebase

This app uses Next.js with API routes, which requires Firebase Web Frameworks support.

1. **Authenticate with Firebase**:
   ```bash
   firebase login --no-localhost
   ```

2. **Initialize Firebase Hosting** (if not already done):
   ```bash
   firebase init hosting
   # Select: Set up GitHub Action deploys? No
   # Firebase will auto-detect Next.js and set up Web Frameworks
   ```

3. **Deploy**:
   ```bash
   npm run firebase:deploy
   ```

Firebase will automatically build and deploy your Next.js app with Cloud Functions for server-side rendering and API routes.

**Note**: Your Firebase project must be on the Blaze (pay-as-you-go) plan to use Cloud Functions.

## Python CLI (Legacy)

The original Python CLI is still available in `src/llm_metascore/`.

### Install

```bash
pip install -e .
```

### Usage

```bash
python -m llm_metascore.cli --type general
python -m llm_metascore.cli --type coding --details
```

Or if installed:
```bash
llm-metascore --type general
llm-metascore --type coding --details
```

Flags:
- `--type`: `general` (lmarena only) or `coding` (lmarena + openrouter)
- `--details`: print aggregated average and per-source ranks

**Note:** The Python CLI uses local Markdown snapshots from `data/.cache/`, while the web app fetches live data.

## Aggregation Rules

- Convert each source to best rank per creator using dense, tie‑preserving ranks; average ranks across sources.
- Missing-in-source rank = max rank in that source + 1.
- No tie-breaks (stable sort by average rank).

Coding mode sources:
- lmarena: Arena Overview Coding column and WebDev category.
- openrouter: Leaderboard, Market Share (author-level), and Programming tables are each treated as distinct sources.

## Vendor Mapping

- OpenAI: contains `gpt` or `chatgpt`, or starts with `o<number>` (e.g., `o3`, `o4`)
- Google: contains `gemini`, `imagen`, or `veo`
- Anthropic: contains `claude`
- xAI: contains `grok`
- Else: `provider/model` prefix if present, otherwise `Other`

Note: Rankings always include exactly these four creators: OpenAI, Google, Anthropic, and xAI. Entries mapped to any other creator (including `Other`) are ignored. If a creator is missing from a given source/category, they receive the worst rank for that source (max rank + 1).

## License

MIT
