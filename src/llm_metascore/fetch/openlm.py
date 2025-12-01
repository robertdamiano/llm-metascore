from __future__ import annotations

import urllib.request
from bs4 import BeautifulSoup
from ..core.models import ModelEntry

def fetch_openlm_coding_sources() -> dict[str, list[ModelEntry]]:
    """Fetch live SWE Bench rankings from OpenLM.ai."""
    url = "https://openlm.ai/swe-bench/"
    # print(f"Fetching live data from {url}...")
    try:
        # specific headers to avoid 403s sometimes associated with scripts
        req = urllib.request.Request(
            url, 
            data=None, 
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
            }
        )
        with urllib.request.urlopen(req) as response:
            html = response.read().decode("utf-8")
    except Exception as e:
        # In a CLI, it might be better to warn but return empty to allow other sources to show
        print(f"Warning: Could not fetch OpenLM data: {e}")
        return {}

    entries = _parse_swe_bench_html(html)
    if entries:
        return {"openlm:swe-bench": entries}
    return {}

def _parse_swe_bench_html(html: str) -> list[ModelEntry]:
    soup = BeautifulSoup(html, "html.parser")
    
    target_table = None
    # Heuristic: Find table with "Model" and "SWE-bench" in headers
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        # The header might be "Open LM Model" or similar
        if any("model" in h for h in headers) and any("swe-bench" in h for h in headers):
            target_table = table
            break
    
    if not target_table:
        return []

    # Identify column indices
    headers = [th.get_text(strip=True).lower() for th in target_table.find_all("th")]
    try:
        model_idx = next(i for i, h in enumerate(headers) if "model" in h)
    except StopIteration:
        return []
    
    rank_idx = next((i for i, h in enumerate(headers) if "rank" in h), None)

    entries = []
    rows_container = target_table.find("tbody") or target_table
    rows = rows_container.find_all("tr")

    # Filter out header row if inside tbody (unlikely) or if using table directly
    # usually <th> are in <thead> or first row. 
    
    current_rank = 1
    for row in rows:
        cols = row.find_all(["td", "th"])
        # Skip rows that are just headers (only th) unless it's a data row? 
        # Safer to skip if it matches header length and text
        if not row.find("td"):
            continue
            
        if len(cols) <= model_idx:
            continue
            
        model_name = cols[model_idx].get_text(strip=True)
        if not model_name or model_name.lower() == "model": # Skip header row if missed
            continue

        rank = current_rank
        if rank_idx is not None and len(cols) > rank_idx:
            val = cols[rank_idx].get_text(strip=True).replace("#", "")
            if val.isdigit():
                rank = int(val)
        
        # Stop if we have enough or hit empty rows
        entries.append(ModelEntry(name=model_name, rank=rank, score=None, source="openlm:swe-bench"))
        current_rank += 1
        
    # Deduplicate by name (keep first/best rank)
    seen = set()
    unique_entries = []
    for e in entries:
        if e.name not in seen:
            seen.add(e.name)
            unique_entries.append(e)
            
    return unique_entries