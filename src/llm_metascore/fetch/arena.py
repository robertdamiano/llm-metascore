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
        # Best-effort; ignore cache failures
        pass


def fetch_arena_general() -> List[ModelEntry]:
    """Fetch lmarena.ai general leaderboard and parse top entries."""
    url = "https://lmarena.ai/leaderboard"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    _cache_snapshot("lmarena-general", resp.content)

    return _parse_arena_leaderboard(resp.text, source="lmarena:general")


def fetch_arena_coding() -> List[ModelEntry]:
    """Fetch lmarena.ai coding leaderboard and parse top entries (if available)."""
    url = "https://lmarena.ai/leaderboard/coding"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    _cache_snapshot("lmarena-coding", resp.content)

    return _parse_arena_leaderboard(resp.text, source="lmarena:coding")


def _parse_arena_leaderboard(html: str, source: str) -> List[ModelEntry]:
    """
    Parse a lmarena.ai leaderboard table from HTML.
    Expected structure may evolve; parser is CSS-selector based and best-effort.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Look for table rows. Try generic selectors known for many leaderboards.
    rows = []
    table = soup.find("table")
    if table:
        tbody = table.find("tbody") or table
        rows = tbody.find_all("tr")
    else:
        rows = soup.select("tr")

    entries: List[ModelEntry] = []
    for tr in rows:
        cells = tr.find_all(["td", "th"])
        if len(cells) < 2:
            continue
        # Heuristics: first cell rank, second cell model name, optional score elsewhere
        try:
            rank_text = cells[0].get_text(strip=True).replace("#", "")
            rank = int("".join(ch for ch in rank_text if ch.isdigit()))
        except Exception:
            continue
        name = cells[1].get_text(" ", strip=True)
        score = None
        # Search for a numeric score in later cells
        for c in cells[2:]:
            txt = c.get_text(strip=True)
            try:
                if txt:
                    score_val = float(txt.replace(",", ""))
                    score = score_val
                    break
            except Exception:
                continue
        entries.append(ModelEntry(name=name, rank=rank, score=score, source=source))

    # Sort by rank just in case
    entries.sort(key=lambda e: e.rank)
    return entries

