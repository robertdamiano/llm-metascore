from __future__ import annotations

from typing import List, Optional
import pathlib
import time
from bs4 import BeautifulSoup

from ..core.models import ModelEntry


CACHE_DIR = pathlib.Path("data/.cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _load_latest_snapshot(prefix: str) -> Optional[str]:
    try:
        files = sorted(CACHE_DIR.glob(f"{prefix}-*.html"), reverse=True)
        if not files:
            return None
        return files[0].read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None


def fetch_openrouter_coding() -> List[ModelEntry]:
    """Parse openrouter coding rankings from a local snapshot (openrouter-*.html)."""
    snap = _load_latest_snapshot("openrouter")
    if snap is None:
        return []
    soup = BeautifulSoup(snap, "html.parser")
    entries: List[ModelEntry] = []

    # Heuristic parsing based on visible ranking lists
    # Find rows/items that contain a rank and model name
    for el in soup.select("[data-rank], .rank, li, tr"):
        rank = None
        name = None
        # Try data-rank attribute
        dr = el.get("data-rank")
        if dr and dr.isdigit():
            rank = int(dr)
        # Try to find text like '#1' or '1'
        if rank is None:
            text = el.get_text(" ", strip=True)
            if text:
                # naive: first number we see
                num = "".join(ch for ch in text.split()[0] if ch.isdigit())
                if num.isdigit():
                    rank = int(num)
        # Find a model name: look for elements with class containing 'model' or anchor text
        name_el = el.select_one(".model, .model-name, a[href*='models'], a")
        if name_el:
            name = name_el.get_text(" ", strip=True)
        else:
            # fallback to the element text (fragile)
            if not name and el.text:
                name = el.get_text(" ", strip=True)

        if rank is not None and name:
            entries.append(ModelEntry(name=name, rank=rank, score=None, source="openrouter:coding"))

    entries.sort(key=lambda e: e.rank)
    # Deduplicate by name keeping best (lowest) rank
    seen = {}
    deduped: List[ModelEntry] = []
    for e in entries:
        if e.name in seen:
            continue
        seen[e.name] = True
        deduped.append(e)
    return deduped
