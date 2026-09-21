"""
bats_core/report.py
==============
Generación del reporte final y visualización en consola.

Output principal: torneo_report.csv
Columnas: Player_User, Pokemon_Used, Wins, Losses, Total_Kills, MVP_Score, Usage_Rate
"""

import pandas as pd
from pathlib import Path

# Intentar usar 'rich' para tablas bonitas en terminal; fallback a texto plano
try:
    from rich.console import Console
    from rich.table import Table
    from rich import box
    _RICH_AVAILABLE = True
    _console = Console()
except ImportError:
    _RICH_AVAILABLE = False


# ─── Guardado CSV ─────────────────────────────────────────────────────────────

def save_csv(df: pd.DataFrame, output_path: Path) -> None:
    """Guarda el DataFrame como CSV con encoding UTF-8."""
    df.to_csv(output_path, index=False, encoding="utf-8")
    print(f"\n✔ Reporte guardado → {output_path.resolve()}")


# ─── Visualización en consola ────────────────────────────────────────────────

def _print_table_rich(title: str, df: pd.DataFrame, max_rows: int = 15) -> None:
    table = Table(
        title=title,
        box=box.SIMPLE_HEAVY,
        header_style="bold cyan",
        show_lines=False,
    )
    for col in df.columns:
        table.add_column(str(col), justify="right" if df[col].dtype != object else "left")

    for _, row in df.head(max_rows).iterrows():
        table.add_row(*[str(v) for v in row])

    _console.print(table)


def _print_table_plain(title: str, df: pd.DataFrame, max_rows: int = 15) -> None:
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print(f"{'─'*60}")
    print(df.head(max_rows).to_string(index=False))


def _print_table(title: str, df: pd.DataFrame, max_rows: int = 15) -> None:
    if _RICH_AVAILABLE:
        _print_table_rich(title, df, max_rows)
    else:
        _print_table_plain(title, df, max_rows)


# ─── Reporte completo ─────────────────────────────────────────────────────────

def print_full_report(
    report_df: pd.DataFrame,
    pick_rate_df: pd.DataFrame,
    mvp_df: pd.DataFrame,
    outliers_df: pd.DataFrame,
    total_battles: int,
) -> None:
    """
    Imprime el resumen ejecutivo del torneo en consola.

    Secciones:
      1. Header con estadísticas generales
      2. Top 20 Pick Rate
      3. Top 10 MVP Score (pokémon más dominante del torneo)
      4. Top 10 jugadores por MVP Score acumulado
      5. Candidatos a baneo (outliers)
    """
    sep = "=" * 60

    print(f"\n{sep}")
    print("  BATS — Battle Analyzing and Tracking System")
    print("  Powered by Pokémon Showdown Log Parser v1.0")
    print(sep)

    # ── Estadísticas generales ────────────────────────────────────────────
    total_players = report_df["Player_User"].nunique()
    total_species = report_df["Pokemon_Used"].nunique()
    total_kills   = int(report_df["Total_Kills"].sum())

    print(f"\n  Batallas procesadas : {total_battles}")
    print(f"  Jugadores únicos    : {total_players}")
    print(f"  Especies distintas  : {total_species}")
    print(f"  KOs totales         : {total_kills}")

    # ── Pick Rate Top 20 ──────────────────────────────────────────────────
    cols_pick = ["Pokemon_Used", "battles_used", "Usage_Rate", "Win_Rate"]
    _print_table("TOP 20 — Pick Rate (uso en % de batallas)", pick_rate_df[cols_pick], max_rows=20)

    # ── MVP Pokémon Top 10 ────────────────────────────────────────────────
    cols_mvp = ["Player_User", "Pokemon_Used", "MVP_Score_Total", "Total_Kills", "Final_Hits"]
    _print_table("TOP 10 — MVP Score (pokémon más dominante)", mvp_df[cols_mvp], max_rows=10)

    # ── MVP por jugador (suma de todos sus pokémon) ───────────────────────
    player_mvp = (
        report_df
        .groupby("Player_User", as_index=False)
        .agg(MVP_Score_Total=("MVP_Score", "sum"), Total_Kills=("Total_Kills", "sum"))
        .sort_values("MVP_Score_Total", ascending=False)
    )
    _print_table("TOP 10 — Jugadores por MVP Score acumulado", player_mvp, max_rows=10)

    # ── Candidatos a baneo ────────────────────────────────────────────────
    print(f"\n{'─'*60}")
    if outliers_df.empty:
        print("  ✅ Sin candidatos a baneo (ningún pokémon supera el umbral).")
    else:
        print(f"  ⚠️  CANDIDATOS A BANEO AUTOMÁTICO ({len(outliers_df)} pokémon)")
        print(f"{'─'*60}")
        cols_ban = ["Pokemon_Used", "Usage_Rate", "Win_Rate", "ban_reason"]
        available = [c for c in cols_ban if c in outliers_df.columns]
        print(outliers_df[available].to_string(index=False))

    print(f"\n{sep}\n")


# ─── Lista de bans del torneo ─────────────────────────────────────────────────

def print_ban_list(bans: list[dict]) -> None:
    """
    Imprime la sección de Pokémon baneados en el torneo.

    Formato de salida::

        ────────────────────────────────────────────────────────────
          POKÉMON BANEADOS EN ESTE TORNEO (2)
        ────────────────────────────────────────────────────────────
          - Garchomp     (Dragon / Ground)  baneado por campixx21
          - Flutter Mane (Ghost / Fairy)    baneado por campizz21

    Si la lista está vacía, imprime una nota indicando que no hay bans.

    Args:
        bans: Lista de dicts con información de los bans activos.
              Se espera que cada dict tenga al menos las claves:
                  - ``pokemon``          (str): Nombre display del Pokémon.
                  - ``types``            (str | None): Tipos del Pokémon.
                  - ``banned_by_player`` (str): Username del jugador que baneó.
              Compatible con el output de ``bans.list_bans()`` y la
              vista ``v_active_bans``.
    """
    sep = "─" * 60
    total = len(bans)

    print(f"\n{sep}")
    if total == 0:
        print("  Sin bans registrados en este torneo.")
        print(sep)
        return

    print(f"  POKÉMON BANEADOS EN ESTE TORNEO ({total})")
    print(sep)

    # Calcular ancho máximo del nombre para alineación
    max_name_len = max(len(b.get("pokemon", "")) for b in bans)

    for ban in bans:
        pokemon = ban.get("pokemon", "")
        types   = ban.get("types") or ""
        player  = ban.get("banned_by_player", "")

        types_str = f"({types})" if types else ""
        padding   = " " * (max_name_len - len(pokemon))

        print(f"  - {pokemon}{padding}  {types_str:<20}  baneado por {player}")

    print()
