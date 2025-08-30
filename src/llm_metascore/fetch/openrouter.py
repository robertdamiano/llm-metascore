from __future__ import annotations

from typing import List
import pathlib
import time
import requests
from bs4 import BeautifulSoup

from ..core.models import ModelEntry


CACHE_DIR = pathlib.Path("data/.cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "llm-metascore/0.1 (+https://github.com/robertdamiano/llm-metascore)"
}


def _cache_snapshot(name: str, content: bytes) -> None:
    ts = int(time.time())
    path = CACHE_DIR / f"{name}-{ts}.html"
    try:
        path.write_bytes(content)
    except Exception:
        pass


def fetch_openrouter_coding() -> List[ModelEntry]:
    """Fetch openrouter.ai coding rankings and parse into ModelEntry list."""
    url = "https://openrouter.ai/rankings/coding"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    _cache_snapshot("openrouter-coding", resp.content)

    soup = BeautifulSoup(resp.text, "html.parser")
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

