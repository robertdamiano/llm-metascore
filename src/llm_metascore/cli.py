from __future__ import annotations

import typer

from .fetch.arena import fetch_arena_general, fetch_arena_coding
from .fetch.openrouter import fetch_openrouter_coding
from .core.aggregate import aggregate_average_rank
from .core.vendors import identify_creator


app = typer.Typer(add_completion=False, help="Rank top LLMs from public leaderboards")


@app.command("top")
def top(
    type: str = typer.Option("general", "--type", help="general|coding"),
    k: int = typer.Option(2, "--k", min=1, help="number of models to return"),
    out: str = typer.Option("txt", "--out", help="txt|md"),
):
    """Show top-k models based on configured sources and aggregation rules."""
    type = type.lower().strip()
    out = out.lower().strip()
    if type not in {"general", "coding"}:
        typer.echo("--type must be 'general' or 'coding'", err=True)
        raise typer.Exit(2)
    if out not in {"txt", "md"}:
        typer.echo("--out must be 'txt' or 'md'", err=True)
        raise typer.Exit(2)

    if type == "general":
        entries = fetch_arena_general()
        # Collapse to creators using best rank per creator
        best: dict[str, int] = {}
        for e in entries:
            c = identify_creator(e.name)
            best[c] = min(best.get(c, 1_000_000), e.rank)
        ordered = sorted(best.items(), key=lambda kv: kv[1])[:k]
        for i, (creator, _) in enumerate(ordered, start=1):
            typer.echo(f"{i}. {creator}")
        return

    # coding: aggregate lmarena coding + openrouter coding by average rank
    arena = fetch_arena_coding()
    openrouter = fetch_openrouter_coding()

    # Convert to creator-level ranks (best rank per creator per source)
    def best_by_creator(pairs):
        m: dict[str, int] = {}
        for name, rank in pairs:
            c = identify_creator(name)
            m[c] = min(m.get(c, 1_000_000), rank)
        # Return as list of tuples
        return list(m.items())

    sources = {
        "lmarena:coding": best_by_creator([(e.name, e.rank) for e in arena]),
        "openrouter:coding": best_by_creator([(e.name, e.rank) for e in openrouter]),
    }
    agg = aggregate_average_rank(sources)
    top_entries = agg[:k]

    for i, e in enumerate(top_entries, start=1):
        typer.echo(f"{i}. {e.name}")


if __name__ == "__main__":
    app()
