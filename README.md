# llm-metascore

Rank top LLM creators (companies) using local Markdown snapshots from lmarena and openrouter. Supports two modes: general and coding.

## Snapshot Inputs

Place Markdown snapshots under `data/.cache/`:
- `lmarena-YYYYMMDD.md`: must include an “Arena Overview” table. If available, include category sections like `**Text**`, `**Vision**`, `**Text-to-Image**`, `**Image Edit**`, `**Search**`, `**Text-to-Video**`, `**Image-to-Video**`, `**WebDev**` with pipe tables.
- `openrouter-YYYYMMDD.md`: include the sections `# Leaderboard`, `# Market Share`, and `# Programming` with pipe tables.

The parser associates each table with the nearest heading/bold section title and extracts ranks from numeric cells.

## Install

```
pip install -e .
```

## Usage

Python module:
```
python -m llm_metascore.cli --type general --k 2
python -m llm_metascore.cli --type coding  --k 3 --details
```

Entry point (if installed):
```
llm-metascore --type general --k 2
llm-metascore --type coding  --k 3 --details
```

Flags:
- `--type`: `general` (lmarena only) or `coding` (lmarena + openrouter)
- `--k`: number of creators to list
- `--details`: print aggregated average and per-source ranks

## Aggregation Rules

- Convert each source to best rank per creator; average ranks across sources.
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

## License

MIT
