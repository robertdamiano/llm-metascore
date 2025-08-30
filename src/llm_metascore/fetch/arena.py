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
        # Best-effort; ignore cache failures
        pass


def _load_latest_snapshot(prefix: str) -> Optional[str]:
    try:
        files = sorted(CACHE_DIR.glob(f"{prefix}-*.html"), reverse=True)
        if not files:
            return None
        return files[0].read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None


def fetch_arena_general() -> List[ModelEntry]:
    """Fetch lmarena.ai general leaderboard and parse top entries.
    Prefers a cached snapshot if present.
    """
    snap = _load_latest_snapshot("lmarena-general")
    if snap is not None:
        html = snap
    else:
        url = "https://lmarena.ai/leaderboard"
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        _cache_snapshot("lmarena-general", resp.content)
        html = resp.text
    return _parse_arena_leaderboard(html, source="lmarena:general")


def fetch_arena_coding() -> List[ModelEntry]:
    """
    Build a coding-focused ranking from lmarena by parsing:
    - Arena Overview Coding column (snapshot prefix: lmarena-overview)
    - WebDev leaderboard (snapshot prefix: lmarena-webdev)

    Strategy: start with the order from Overview's Coding column; then append
    any additional models from WebDev (in their listed order) that aren't already included.
    """
    overview_html = _load_latest_snapshot("lmarena-overview")
    webdev_html = _load_latest_snapshot("lmarena-webdev")

    names: List[str] = []
    if overview_html:
        names = _parse_overview_coding_names(overview_html)
    webdev_entries: List[ModelEntry] = []
    if webdev_html:
        # Reuse generic table parser; ranks in that page determine order
        webdev_entries = _parse_arena_leaderboard(webdev_html, source="lmarena:webdev")

    seen = set(names)
    for e in webdev_entries:
        if e.name not in seen:
            names.append(e.name)
            seen.add(e.name)

    # Convert to ranked ModelEntry list
    result: List[ModelEntry] = [
        ModelEntry(name=n, rank=i + 1, score=None, source="lmarena:coding") for i, n in enumerate(names)
    ]
    return result


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


def _parse_overview_coding_names(html: str) -> List[str]:
    """Extract ordered model names from the Arena Overview 'Coding' column.
    Heuristic: locate a heading containing 'Coding' and then read the subsequent
    list/table/link items in document order within that section.
    """
    soup = BeautifulSoup(html, "html.parser")
    # Try headings first
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        if "coding" in heading.get_text(" ", strip=True).lower():
            # Search within the same section/container for lists of models
            container = heading.find_parent()
            if container is None:
                container = heading
            # Collect candidates: list items, table rows, or anchor tags that look like model links
            names: List[str] = []
            # List items
            for li in container.find_all("li"):
                txt = li.get_text(" ", strip=True)
                if txt:
                    names.append(txt)
            # Table rows
            if not names:
                for tr in container.find_all("tr"):
                    cells = tr.find_all(["td", "th"])
                    if len(cells) >= 2:
                        name = cells[1].get_text(" ", strip=True)
                        if name:
                            names.append(name)
            # Anchors fallback
            if not names:
                for a in container.find_all("a"):
                    txt = a.get_text(" ", strip=True)
                    if txt:
                        names.append(txt)
            # Deduplicate keeping order
            seen = set()
            ordered = []
            for n in names:
                if n not in seen:
                    ordered.append(n)
                    seen.add(n)
            if ordered:
                return ordered

    # Fallback: scan for any sections with 'Coding' text and nearby lists
    for el in soup.find_all(text=True):
        if isinstance(el, str) and "coding" in el.lower():
            parent = el.parent
            if parent:
                names: List[str] = []
                for li in parent.find_all("li"):
                    txt = li.get_text(" ", strip=True)
                    if txt:
                        names.append(txt)
                if names:
                    # Deduplicate
                    seen = set()
                    ordered = []
                    for n in names:
                        if n not in seen:
                            ordered.append(n)
                            seen.add(n)
                    return ordered
    return []
