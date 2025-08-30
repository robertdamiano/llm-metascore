from __future__ import annotations

from typing import List, Optional
import pathlib
import time
import requests
from bs4 import BeautifulSoup

from ..core.models import ModelEntry


CACHE_DIR = pathlib.Path("data/.cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def _cache_snapshot(name: str, content: bytes) -> None:
    ts = int(time.time())
    path = CACHE_DIR / f"{name}-{ts}.html"
    try:
        path.write_bytes(content)
    except Exception:
        pass


def _load_latest_snapshot(prefix: str) -> Optional[str]:
    try:
        files = sorted(CACHE_DIR.glob(f"{prefix}-*.html"), reverse=True)
        if not files:
            return None
        return files[0].read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None


def fetch_openrouter_coding() -> List[ModelEntry]:
    """Fetch openrouter.ai coding rankings and parse into ModelEntry list.
    Prefers a cached snapshot (saved from a browser) if present.
    """
    snap = _load_latest_snapshot("openrouter-coding")
    if snap is not None:
        soup = BeautifulSoup(snap, "html.parser")
    else:
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
