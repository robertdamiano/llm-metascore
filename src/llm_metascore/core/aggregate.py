from typing import Dict, List, Iterable, Tuple
from .models import AggregatedEntry
from .vendors import ALLOWED_CREATORS


def aggregate_average_rank(sources: Dict[str, List[Tuple[str, int]]]) -> List[AggregatedEntry]:
    """
    Aggregate ranks across sources using average rank.

    Missing-from-source handling: assign rank = (max_rank_of_that_source + 1).
    Tie-breaks: none (preserve ordering given by Python's sort stability).
    """
    # Drop sources with no data to avoid biasing ranks
    sources = {src: pairs for src, pairs in sources.items() if pairs}
    if not sources:
        return []

    # Determine max rank per source
    max_ranks: Dict[str, int] = {}
    for src, pairs in sources.items():
        max_ranks[src] = max((rank for _, rank in pairs), default=0)

    # Collect all model names
    model_names = set()
    for pairs in sources.values():
        for name, _ in pairs:
            model_names.add(name)
    # Ensure we always include the allowed creators, even if absent everywhere
    model_names.update(ALLOWED_CREATORS)

    # Build fast lookup per source
    lookup: Dict[str, Dict[str, int]] = {src: {name: rank for name, rank in pairs} for src, pairs in sources.items()}

    aggregated: List[AggregatedEntry] = []
    for name in model_names:
        ranks: Dict[str, int] = {}
        total = 0.0
        count = 0
        for src in sources.keys():
            rank = lookup[src].get(name)
            if rank is None:
                rank = max_ranks[src] + 1
            ranks[src] = rank
            total += rank
            count += 1
        aggregated.append(
            AggregatedEntry(name=name, ranks=ranks, aggregated_rank=total / count if count else 0.0)
        )

    aggregated.sort(key=lambda e: e.aggregated_rank)
    return aggregated
