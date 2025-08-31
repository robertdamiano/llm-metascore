from __future__ import annotations

from typing import List, Optional, Tuple
import pathlib
import time
from .text_parsers import parse_markdown_tables

from ..core.models import ModelEntry


CACHE_DIR = pathlib.Path("data/.cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _load_latest_snapshot(prefix: str) -> Optional[str]:
    try:
        files = sorted(CACHE_DIR.glob(f"{prefix}-*.md"), reverse=True)
        if not files:
            return None
        return files[0].read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None


def _load_all_snapshots(prefix: str) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    try:
        for f in sorted(CACHE_DIR.glob(f"{prefix}-*.md"), reverse=True):
            try:
                out.append((f.name, f.read_text(encoding="utf-8", errors="ignore")))
            except Exception:
                continue
    except Exception:
        pass
    return out


def fetch_openrouter_coding_sources() -> dict[str, list[ModelEntry]]:
    """Parse one or more coding-related leaderboards from openrouter Markdown snapshots (openrouter-*.md)."""
    sources: dict[str, list[ModelEntry]] = {}
    snapshots = _load_all_snapshots("openrouter")
    if not snapshots:
        snap = _load_latest_snapshot("openrouter")
        if snap is None:
            return {}
        snapshots = [("openrouter.md", snap)]

    for fname, md in snapshots:
        page_sources: dict[str, list[ModelEntry]] = {}
        tables = parse_markdown_tables(md)
        for t in tables:
            title = (t.section or "").strip()
            title_l = title.lower()
            if "market share" in title_l:
                entries = _parse_openrouter_market_share_md_table(t)
                if entries:
                    page_sources[f"openrouter:{fname}:Market Share"] = entries
            elif any(k in title_l for k in ("programming", "coding")):
                entries = _parse_openrouter_md_table(t)
                if entries:
                    page_sources[f"openrouter:{fname}:Programming"] = entries
            elif "leaderboard" in title_l:
                entries = _parse_openrouter_md_table(t)
                if entries:
                    page_sources[f"openrouter:{fname}:Leaderboard"] = entries
        sources.update(page_sources)
    return sources

def _parse_openrouter_md_table(t) -> list[ModelEntry]:
    headers_lower = [h.strip().lower() for h in t.headers]
    # Model name column
    try:
        name_idx = next(i for i, h in enumerate(headers_lower) if h.startswith("model"))
    except StopIteration:
        return []
    # Rank column preference
    rank_idx = None
    for i, h in enumerate(headers_lower):
        if "rank" in h:
            rank_idx = i
            break
    if rank_idx is None:
        rank_idx = 0
    out: list[ModelEntry] = []
    for r in t.rows:
        if len(r) <= max(name_idx, rank_idx):
            continue
        name = r[name_idx].strip()
        if not name:
            continue
        rv = r[rank_idx].strip().replace('#', '')
        digits = "".join(ch for ch in rv if ch.isdigit())
        rank = int(digits) if digits else len(out) + 1
        out.append(ModelEntry(name=name, rank=rank, score=None, source="openrouter"))
    out.sort(key=lambda e: e.rank)
    # Deduplicate by name, keep first
    seen = set()
    dedup: list[ModelEntry] = []
    for e in out:
        if e.name in seen:
            continue
        seen.add(e.name)
        dedup.append(e)
    return dedup


def _parse_openrouter_market_share_md_table(t) -> list[ModelEntry]:
    headers_lower = [h.strip().lower() for h in t.headers]
    # Author column is required
    try:
        author_idx = headers_lower.index("author")
    except ValueError:
        return []
    # Rank column preferred, else derive from order
    rank_idx = headers_lower.index("rank") if "rank" in headers_lower else None
    out: list[ModelEntry] = []
    for i, r in enumerate(t.rows, start=1):
        if len(r) <= author_idx:
            continue
        author = r[author_idx].strip()
        if not author:
            continue
        rank = None
        if rank_idx is not None and len(r) > rank_idx:
            rv = r[rank_idx].strip().replace('#', '')
            digits = "".join(ch for ch in rv if ch.isdigit())
            if digits:
                rank = int(digits)
        if rank is None:
            rank = i
        # Use author as the name; identify_creator will normalize providers
        out.append(ModelEntry(name=author, rank=rank, score=None, source="openrouter:market-share"))
    out.sort(key=lambda e: e.rank)
    return out
