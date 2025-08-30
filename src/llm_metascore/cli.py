from __future__ import annotations

import typer

from .fetch.arena import fetch_arena_general, fetch_arena_coding
from .fetch.openrouter import fetch_openrouter_coding
from .core.aggregate import aggregate_average_rank


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
        top_entries = entries[:k]
        if out == "md":
            for i, e in enumerate(top_entries, start=1):
                typer.echo(f"{i}. {e.name} (lmarena rank {e.rank}, score {e.score})")
        else:
            for i, e in enumerate(top_entries, start=1):
                typer.echo(f"{i}. {e.name} | lmarena rank {e.rank} | score {e.score}")
        return

    # coding: aggregate lmarena coding + openrouter coding by average rank
    arena = fetch_arena_coding()
    openrouter = fetch_openrouter_coding()

    sources = {
        "lmarena:coding": [(e.name, e.rank) for e in arena],
        "openrouter:coding": [(e.name, e.rank) for e in openrouter],
    }
    agg = aggregate_average_rank(sources)
    top_entries = agg[:k]

    if out == "md":
        for i, e in enumerate(top_entries, start=1):
            ranks_str = ", ".join(f"{src} #{rank}" for src, rank in e.ranks.items())
            typer.echo(f"{i}. {e.name} (avg rank {e.aggregated_rank:.2f}) — {ranks_str}")
    else:
        for i, e in enumerate(top_entries, start=1):
            ranks_str = " | ".join(f"{src}:{rank}" for src, rank in e.ranks.items())
            typer.echo(f"{i}. {e.name} | avg {e.aggregated_rank:.2f} | {ranks_str}")


if __name__ == "__main__":
    app()
