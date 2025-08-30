from __future__ import annotations

import typer

from .fetch.arena import fetch_arena_general_sources, fetch_arena_coding_sources
from .fetch.openrouter import fetch_openrouter_coding
from .core.aggregate import aggregate_average_rank
from .core.vendors import identify_creator


app = typer.Typer(add_completion=False, help="Rank top LLM creators from local snapshots")


@app.callback(invoke_without_command=True)
def top(
    type: str = typer.Option("general", "--type", help="general|coding"),
    k: int = typer.Option(2, "--k", min=1, help="number of creators to return"),
):
    """Show top-k creators based on local HTML snapshots and aggregation rules."""
    type = type.lower().strip()
    if type not in {"general", "coding"}:
        typer.echo("--type must be 'general' or 'coding'", err=True)
        raise typer.Exit(2)

    if type == "general":
        sources_raw = fetch_arena_general_sources()
        if not sources_raw:
            raise typer.Exit(1)

        def best_by_creator_entries(entries):
            m: dict[str, int] = {}
            for e in entries:
                c = identify_creator(e.name)
                m[c] = min(m.get(c, 1_000_000), e.rank)
            return list(m.items())

        sources = {src: best_by_creator_entries(entries) for src, entries in sources_raw.items() if entries}
        agg = aggregate_average_rank(sources)
        for i, e in enumerate(agg[:k], start=1):
            typer.echo(f"{i}. {e.name}")
        return

    # coding: aggregate lmarena (overview coding + webdev) + openrouter coding
    arena_sources = fetch_arena_coding_sources()
    openrouter_entries = fetch_openrouter_coding()

    def best_by_creator_entries(entries):
        m: dict[str, int] = {}
        for e in entries:
            c = identify_creator(e.name)
            m[c] = min(m.get(c, 1_000_000), e.rank)
        return list(m.items())

    sources = {src: best_by_creator_entries(entries) for src, entries in arena_sources.items()}
    sources["openrouter:coding"] = best_by_creator_entries(openrouter_entries)
    agg = aggregate_average_rank(sources)
    for i, e in enumerate(agg[:k], start=1):
        typer.echo(f"{i}. {e.name}")


if __name__ == "__main__":
    app()
