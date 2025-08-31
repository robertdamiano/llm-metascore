from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass
class MarkdownTable:
    section: str
    headers: List[str]
    rows: List[List[str]]


def _is_md_heading(line: str) -> Optional[str]:
    s = line.strip()
    # Hash heading: # Title
    if s.startswith("#"):
        # count leading #'s then strip
        i = 0
        while i < len(s) and s[i] == '#':
            i += 1
        title = s[i:].strip()
        return title if title else None
    # Bold-only section: **Text**
    if s.startswith("**") and s.endswith("**") and len(s) >= 4:
        title = s.strip("*").strip()
        return title if title else None
    return None


def _is_separator(line: str) -> bool:
    # typical: | --- | :---: |
    s = line.strip()
    if '|' not in s:
        return False
    # Must contain --- or :--- characters between pipes
    return any(ch in s for ch in ('-', ':')) and set(s.replace('|', '').strip()) <= set('-: ')


def _split_row(line: str) -> List[str]:
    # Trim and split on pipes, removing leading/trailing empty cells
    s = line.strip()
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    parts = [c.strip() for c in s.split('|')]
    return parts


def parse_markdown_tables(md: str) -> List[MarkdownTable]:
    """Parse all Markdown tables with their nearest preceding section title.

    Section title is taken from the nearest prior heading line ("# ...") or bold line ("**Text**").
    """
    lines = md.splitlines()
    out: List[MarkdownTable] = []
    current_section = ""
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        title = _is_md_heading(line)
        if title is not None:
            current_section = title
            i += 1
            continue
        # Detect table header + separator
        if '|' in line:
            # peek next non-empty
            j = i + 1
            if j < n and _is_separator(lines[j]):
                header_cells = _split_row(line)
                j += 1
                body: List[List[str]] = []
                while j < n and '|' in lines[j].strip() and not _is_md_heading(lines[j]):
                    row = _split_row(lines[j])
                    if any(cell for cell in row):
                        body.append(row)
                    j += 1
                if header_cells and body:
                    out.append(MarkdownTable(section=current_section or "", headers=header_cells, rows=body))
                    i = j
                    continue
        i += 1
    return out


def first_table_by_section(md: str, section_match: str) -> Optional[MarkdownTable]:
    """Return the first table whose section title contains the given text (case-insensitive)."""
    section_match = (section_match or "").lower()
    for t in parse_markdown_tables(md):
        if section_match in (t.section or "").lower():
            return t
    return None


def all_tables(md: str) -> List[MarkdownTable]:
    return parse_markdown_tables(md)

