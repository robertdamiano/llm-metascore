from __future__ import annotations

from typing import List, Optional
import pathlib
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


def fetch_arena_general() -> List[ModelEntry]:
    """Parse the lmarena Arena Overview 'Overall' column from a local snapshot (lmarena-*.html)."""
    html = _load_latest_snapshot("lmarena")
    if html is None:
        return []
    return _parse_overview_column(html, column_name="Overall", source="lmarena:overall")


def fetch_arena_coding() -> List[ModelEntry]:
    """Parse the lmarena Arena Overview 'Coding' column from a local snapshot (lmarena-*.html)."""
    html = _load_latest_snapshot("lmarena")
    if html is None:
        return []
    return _parse_overview_column(html, column_name="Coding", source="lmarena:coding")


def _parse_overview_column(html: str, column_name: str, source: str) -> List[ModelEntry]:
    """Parse Arena Overview table for a given column (e.g., 'Overall', 'Coding')."""
    soup = BeautifulSoup(html, "html.parser")

    # Find a table whose header contains both 'Model' and the target column
    target_table = None
    for table in soup.find_all("table"):
        headers = [th.get_text(" ", strip=True) for th in table.find_all("th")]
        headers_lower = [h.lower() for h in headers]
        if any("model" == h or h.startswith("model") for h in headers_lower) and column_name.lower() in headers_lower:
            target_table = table
            break

    if target_table is None:
        return []

    # Column indexes
    headers = [th.get_text(" ", strip=True) for th in target_table.find_all("th")]
    name_idx = None
    col_idx = None
    for i, h in enumerate(headers):
        hl = h.strip().lower()
        if name_idx is None and hl.startswith("model"):
            name_idx = i
        if col_idx is None and hl == column_name.lower():
            col_idx = i
    if name_idx is None or col_idx is None:
        return []

    rows = target_table.find("tbody")
    if rows is None:
        rows = target_table
    trs = rows.find_all("tr")

    entries: List[ModelEntry] = []
    rank = 1
    for tr in trs:
        cells = tr.find_all(["td", "th"])
        if len(cells) <= max(name_idx, col_idx):
            continue
        name = cells[name_idx].get_text(" ", strip=True)
        val = cells[col_idx].get_text(" ", strip=True)
        # Skip if column has no rank/value
        if not name or not val:
            continue
        entries.append(ModelEntry(name=name, rank=rank, score=None, source=source))
        rank += 1

    return entries
