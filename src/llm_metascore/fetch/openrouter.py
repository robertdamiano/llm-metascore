from __future__ import annotations

from typing import List, Optional, Tuple
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


def _load_all_snapshots(prefix: str) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    try:
        for f in sorted(CACHE_DIR.glob(f"{prefix}-*.html"), reverse=True):
            try:
                out.append((f.name, f.read_text(encoding="utf-8", errors="ignore")))
            except Exception:
                continue
    except Exception:
        pass
    return out


def fetch_openrouter_coding_sources() -> dict[str, list[ModelEntry]]:
    """Parse one or more coding-related leaderboards from openrouter snapshot (openrouter-*.html)."""
    sources: dict[str, list[ModelEntry]] = {}
    snapshots = _load_all_snapshots("openrouter")
    if not snapshots:
        snap = _load_latest_snapshot("openrouter")
        if snap is None:
            return {}
        snapshots = [("openrouter.html", snap)]

    for fname, html in snapshots:
        soup = BeautifulSoup(html, "html.parser")
        page_sources: dict[str, list[ModelEntry]] = {}
        # sections explicitly labeled 'Coding'
        for h in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
            htxt = h.get_text(" ", strip=True)
            if "coding" not in htxt.lower():
                continue
            table = h.find_next("table")
            if table:
                entries = _parse_openrouter_table(table)
                if entries:
                    page_sources[f"openrouter:{htxt}"] = entries
        if not page_sources:
            items = soup.select("[data-rank]")
            entries = _parse_openrouter_items(items)
            if entries:
                page_sources[f"openrouter:{fname}"] = entries
        # Merge into global sources
        sources.update(page_sources)
    return sources


def _parse_openrouter_table(table) -> list[ModelEntry]:
    rows = (table.find("tbody") or table).find_all("tr")
    out: list[ModelEntry] = []
    for tr in rows:
        tds = tr.find_all(["td", "th"])
        if len(tds) < 2:
            continue
        rank = None
        try:
            txt = tds[0].get_text(" ", strip=True)
            num = "".join(ch for ch in txt if ch.isdigit())
            if num:
                rank = int(num)
        except Exception:
            pass
        name = tds[1].get_text(" ", strip=True)
        if name:
            if rank is None:
                rank = len(out) + 1
            out.append(ModelEntry(name=name, rank=rank, score=None, source="openrouter:coding"))
    out.sort(key=lambda e: e.rank)
    return out


def _parse_openrouter_items(items) -> list[ModelEntry]:
    out: list[ModelEntry] = []
    for el in items:
        rank = None
        dr = el.get("data-rank") if hasattr(el, 'get') else None
        if dr and str(dr).strip().isdigit():
            rank = int(str(dr).strip())
        if rank is None:
            txt = el.get_text(" ", strip=True)
            if txt:
                first = txt.split()[0]
                num = "".join(ch for ch in first if ch.isdigit())
                if num.isdigit():
                    rank = int(num)
        name_el = None
        if hasattr(el, 'select_one'):
            name_el = el.select_one("a[href*='/models/'], .model, .model-name, .name")
        name = name_el.get_text(" ", strip=True) if name_el else None
        if not name:
            name = getattr(el, 'text', '')
        if name:
            if rank is None:
                rank = len(out) + 1
            out.append(ModelEntry(name=name, rank=rank, score=None, source="openrouter:coding"))
    out.sort(key=lambda e: e.rank)
    # Deduplicate by name
    seen = set()
    dedup: list[ModelEntry] = []
    for e in out:
        if e.name in seen:
            continue
        seen.add(e.name)
        dedup.append(e)
    return dedup
