from __future__ import annotations

from typing import List, Optional, Dict, Tuple
import pathlib
from .text_parsers import first_table_by_section, MarkdownTable

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


def fetch_arena_general_sources() -> Dict[str, List[ModelEntry]]:
    """Return multiple general-purpose sources from a single lmarena snapshot.

    Includes:
    - Arena Overview columns excluding 'Coding' (e.g., Overall, Math, etc.)
    - Category leaderboards: Text, Vision, Text-to-Image, Image Edit, Search, Text-to-Video, Image-to-Video
    """
    md = _load_latest_snapshot("lmarena")
    if md is None:
        return {}

    sources: Dict[str, List[ModelEntry]] = {}

    # Overview columns (all except Coding and Model)
    overview = _parse_overview_columns_md(md, source_prefix="lmarena:overview")
    for col, entries in overview.items():
        if col.lower() == "coding":
            continue
        sources[f"lmarena:overview:{col}"] = entries

    # Category leaderboards by headings or nearest table caption/heading
    categories = [
        "Text",
        "Vision",
        "Text-to-Image",
        "Image Edit",
        "Search",
        "Text-to-Video",
        "Image-to-Video",
    ]
    # Directly parse by section name
    for cat in categories:
        entries = _parse_category_leaderboard_md(md, cat, source=f"lmarena:{cat}")
        if entries:
            sources[f"lmarena:{cat}"] = entries

    return sources


def fetch_arena_coding_sources() -> Dict[str, List[ModelEntry]]:
    """Return coding-related sources from a single lmarena snapshot.

    Includes:
    - Arena Overview 'Coding' column
    - 'WebDev' category leaderboard
    """
    md = _load_latest_snapshot("lmarena")
    if md is None:
        return {}
    sources: Dict[str, List[ModelEntry]] = {}
    coding = _parse_overview_column_md(md, column_name="Coding", source="lmarena:overview:Coding")
    if coding:
        sources["lmarena:overview:Coding"] = coding
    webdev = _parse_category_leaderboard_md(md, "WebDev", source="lmarena:WebDev")
    if webdev:
        sources["lmarena:WebDev"] = webdev
    return sources


def _parse_overview_column_md(md: str, column_name: str, source: str) -> List[ModelEntry]:
    """Parse Arena Overview table (Markdown) for a given column (e.g., 'Overall', 'Coding')."""
    t = first_table_by_section(md, "Arena Overview")
    if not t:
        return []
    headers_lower = [h.strip().lower() for h in t.headers]
    try:
        name_idx = next(i for i, h in enumerate(headers_lower) if h.startswith("model"))
        col_idx = headers_lower.index(column_name.lower())
    except Exception:
        return []
    entries: List[ModelEntry] = []
    for r in t.rows:
        if len(r) <= max(name_idx, col_idx):
            continue
        name = r[name_idx].strip()
        val = r[col_idx].strip()
        if not name:
            continue
        digits = "".join(ch for ch in val if ch.isdigit())
        if not digits:
            continue
        rank = int(digits)
        entries.append(ModelEntry(name=name, rank=rank, score=None, source=source))
    entries.sort(key=lambda e: e.rank)
    return entries


def _parse_overview_columns_md(md: str, source_prefix: str) -> Dict[str, List[ModelEntry]]:
    """Parse all non-Model columns from Arena Overview Markdown table into per-column rankings."""
    t = first_table_by_section(md, "Arena Overview")
    if not t:
        return {}
    headers = t.headers
    headers_lower = [h.strip().lower() for h in headers]
    try:
        name_idx = next(i for i, h in enumerate(headers_lower) if h.startswith("model"))
    except StopIteration:
        return {}
    # Collect numeric cell per column
    col_items: Dict[int, List[Tuple[str, int]]] = {}
    for r in t.rows:
        if len(r) <= name_idx:
            continue
        name = r[name_idx].strip()
        if not name:
            continue
        for col_idx, cell in enumerate(r):
            if col_idx == name_idx:
                continue
            digits = "".join(ch for ch in cell if ch.isdigit())
            if not digits:
                continue
            col_items.setdefault(col_idx, []).append((name, int(digits)))
    results: Dict[str, List[ModelEntry]] = {}
    for col_idx, items in col_items.items():
        col_name = headers[col_idx] if col_idx < len(headers) else f"Col{col_idx}"
        items.sort(key=lambda x: x[1])
        results[col_name] = [
            ModelEntry(name=name, rank=i + 1, score=None, source=f"{source_prefix}:{col_name}")
            for i, (name, _) in enumerate(items)
        ]
    return results


def _parse_category_leaderboard_md(md: str, heading: str, source: str) -> List[ModelEntry]:
    t = first_table_by_section(md, heading)
    if not t:
        return []
    return _parse_named_md_table(t, source)


def _parse_named_md_table(table: MarkdownTable, source: str) -> List[ModelEntry]:
    headers_lower = [h.strip().lower() for h in table.headers]
    try:
        name_idx = next(i for i, h in enumerate(headers_lower) if h.startswith("model"))
    except StopIteration:
        name_idx = 1 if len(headers_lower) > 1 else 0
    rank_idx = None
    for i, h in enumerate(headers_lower):
        if "rank" in h:
            rank_idx = i
            break
    if rank_idx is None:
        rank_idx = 0

    entries: List[ModelEntry] = []
    for r in table.rows:
        if len(r) <= max(name_idx, rank_idx):
            continue
        name = r[name_idx].strip()
        if not name:
            continue
        rv = r[rank_idx].strip().replace('#', '')
        digits = "".join(ch for ch in rv if ch.isdigit())
        rank = int(digits) if digits else len(entries) + 1
        entries.append(ModelEntry(name=name, rank=rank, score=None, source=source))
    entries.sort(key=lambda e: e.rank)
    return entries


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

    pairs: List[Tuple[str, float]] = []
    order = 0
    for tr in trs:
        cells = tr.find_all(["td", "th"])
        if len(cells) <= max(name_idx, col_idx):
            continue
        name = cells[name_idx].get_text(" ", strip=True)
        val_text = cells[col_idx].get_text(" ", strip=True)
        if not name:
            continue
        score = None
        # Attempt to parse a numeric value to sort by actual column rank
        try:
            num = "".join(ch for ch in val_text if (ch.isdigit() or ch == "."))
            if num:
                score = float(num)
        except Exception:
            score = None
        if score is None:
            # fallback to table order if no usable value
            score = float(order)
        pairs.append((name, score))
        order += 1

    pairs.sort(key=lambda x: x[1])
    entries: List[ModelEntry] = []
    for i, (name, _) in enumerate(pairs, start=1):
        entries.append(ModelEntry(name=name, rank=i, score=None, source=source))
    return entries


def _parse_overview_columns(html: str, source_prefix: str = "lmarena:overview") -> Dict[str, List[ModelEntry]]:
    """Parse all columns from Arena Overview table into per-column rankings."""
    soup = BeautifulSoup(html, "html.parser")
    target_table = None
    for table in soup.find_all("table"):
        headers = [th.get_text(" ", strip=True) for th in table.find_all("th")]
        headers_lower = [h.lower() for h in headers]
        if any("model" == h or h.startswith("model") for h in headers_lower) and "overall" in headers_lower:
            target_table = table
            break
    if target_table is None:
        return {}

    headers = [th.get_text(" ", strip=True) for th in target_table.find_all("th")]
    name_idx = None
    for i, h in enumerate(headers):
        if h.strip().lower().startswith("model"):
            name_idx = i
            break
    if name_idx is None:
        return {}

    rows = target_table.find("tbody") or target_table
    trs = rows.find_all("tr")

    # For each column (excluding model), collect values then sort
    col_values: Dict[int, List[Tuple[str, float, int]]] = {}
    for tr_index, tr in enumerate(trs):
        cells = tr.find_all(["td", "th"])
        if len(cells) <= name_idx:
            continue
        name = cells[name_idx].get_text(" ", strip=True)
        if not name:
            continue
        for col_idx in range(len(cells)):
            if col_idx == name_idx:
                continue
            val_text = cells[col_idx].get_text(" ", strip=True)
            score = None
            try:
                num = "".join(ch for ch in val_text if (ch.isdigit() or ch == "."))
                if num:
                    score = float(num)
            except Exception:
                score = None
            if score is None:
                score = float(1e9 + tr_index)  # push unknowns to bottom
            col_values.setdefault(col_idx, []).append((name, score, tr_index))

    results: Dict[str, List[ModelEntry]] = {}
    for col_idx, items in col_values.items():
        col_name = headers[col_idx] if col_idx < len(headers) else f"Col{col_idx}"
        items.sort(key=lambda x: (x[1], x[2]))
        entries = [ModelEntry(name=name, rank=i + 1, score=None, source=f"{source_prefix}:{col_name}") for i, (name, _, _) in enumerate(items)]
        results[col_name] = entries
    return results


def _parse_category_leaderboard(html: str, heading: str, source: str) -> List[ModelEntry]:
    """Find a table near a heading matching the given text and parse ranks."""
    soup = BeautifulSoup(html, "html.parser")
    # Find heading element
    heading_el = None
    for tag in ["h1", "h2", "h3", "h4", "h5", "h6"]:
        for el in soup.find_all(tag):
            if heading.lower() in el.get_text(" ", strip=True).lower():
                heading_el = el
                break
        if heading_el:
            break
    table = None
    if heading_el:
        # search following siblings for a table
        sib = heading_el
        for _ in range(10):
            sib = sib.find_next_sibling()
            if sib is None:
                break
            table = sib.find("table") if sib.name != "table" else sib
            if table:
                break
    if table is None:
        # Fallback: any table with caption/header containing heading
        for t in soup.find_all("table"):
            cap = t.find("caption")
            txt = (cap.get_text(" ", strip=True) if cap else "") + " " + " ".join(
                th.get_text(" ", strip=True) for th in t.find_all("th")
            )
            if heading.lower() in txt.lower():
                table = t
                break
    if table is None:
        return []

    # Parse: assume first column is rank, second is name
    rows = table.find("tbody") or table
    trs = rows.find_all("tr")
    return _parse_named_table(trs, source)


def _tables_with_headings(html: str) -> List[Tuple[str, object]]:
    """Return list of (heading_text, table_element) pairs for all tables on the page."""
    soup = BeautifulSoup(html, "html.parser")
    pairs: List[Tuple[str, object]] = []
    for table in soup.find_all("table"):
        # Find nearest previous heading text
        htxt = ""
        prev = table
        for _ in range(8):
            prev = prev.find_previous_sibling()
            if not prev:
                break
            if prev.name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
                htxt = prev.get_text(" ", strip=True)
                break
        if not htxt:
            cap = table.find("caption")
            if cap:
                htxt = cap.get_text(" ", strip=True)
        pairs.append((htxt, table))
    return pairs


def _parse_named_table(table_or_tbody, source: str) -> List[ModelEntry]:
    """Parse a table-like element assuming first column rank, second column name."""
    tbody = table_or_tbody.find("tbody") if hasattr(table_or_tbody, "find") else None
    rows_container = tbody or table_or_tbody
    trs = rows_container.find_all("tr") if hasattr(rows_container, "find_all") else []
    entries: List[ModelEntry] = []
    for tr in trs:
        cells = tr.find_all(["td", "th"]) if hasattr(tr, "find_all") else []
        if len(cells) < 2:
            continue
        rank = None
        try:
            rtxt = cells[0].get_text(" ", strip=True).replace("#", "")
            num = "".join(ch for ch in rtxt if ch.isdigit())
            if num:
                rank = int(num)
        except Exception:
            rank = None
        name = cells[1].get_text(" ", strip=True)
        if not name:
            continue
        if rank is None:
            rank = len(entries) + 1
        entries.append(ModelEntry(name=name, rank=rank, score=None, source=source))
    entries.sort(key=lambda e: e.rank)
    return entries
