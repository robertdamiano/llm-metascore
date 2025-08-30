from typing import Optional, Dict, List
from pydantic import BaseModel


class ModelEntry(BaseModel):
    name: str
    rank: int
    score: Optional[float] = None  # For lmarena where available
    source: str


class AggregatedEntry(BaseModel):
    name: str
    ranks: Dict[str, int]  # source -> rank
    aggregated_rank: float  # average rank across sources

