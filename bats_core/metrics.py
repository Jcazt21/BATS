"""
bats_core/metrics.py
===============
Lógica de negocio BI — cálculo de métricas sobre batallas parseadas.

Métricas implementadas:
  1. MVP Score por pokémon:  ver bats_core/mvp.py (fórmula única)
  2. Pick Rate global:       Usage % = (Veces_Pickeado / Total_Batallas) × 100
  3. Win Rate por pokémon:   % de batallas ganadas cuando ese pokémon fue usado
  4. Outlier Detection:      Pokémon con Pick Rate > threshold → candidatos a baneo
"""

import pandas as pd
from .mvp import mvp_score
from .parser import BattleData, PokemonStats


# ─── Fórmula MVP ──────────────────────────────────────────────────────────────

def compute_mvp_score(stats: PokemonStats) -> float:
    """Puntaje MVP de un pokémon en una batalla. La fórmula vive en bats_core/mvp.py."""
    return mvp_score(stats.kills, stats.turns_active, stats.survived, stats.final_hit)


# ─── Construcción del DataFrame base ──────────────────────────────────────────

def build_raw_dataframe(battles: list[BattleData]) -> pd.DataFrame:
    """
    Genera un DataFrame plano con una fila por (batalla, jugador, pokémon).
    Es la tabla base de la que derivan todas las métricas agregadas.

    Columnas:
      battle_id, format, date, Player_User, Pokemon_Used,
      won_battle, kills_in_battle, turns_survived, survived, final_hit, mvp_score_battle
    """
    records = []

    for battle in battles:
        # Expandir los equipos de ambos jugadores para capturar pokémon
        # que no tuvieron eventos en el log (banqueados / no usados)
        team_map: dict[str, list[str]] = {
            battle.p1: battle.p1_team,
            battle.p2: battle.p2_team,
        }

        # Índice rápido de pokémon que sí tuvieron eventos
        seen: set[tuple[str, str]] = set()

        for pstats in battle.pokemon_stats:
            key = (pstats.player, pstats.species)
            seen.add(key)
            records.append({
                "battle_id":        battle.battle_id,
                "format":           battle.format,
                "date":             battle.date,
                "Player_User":      pstats.player,
                "Pokemon_Used":     pstats.species,
                "won_battle":       battle.winner == pstats.player,
                "kills_in_battle":  pstats.kills,
                "turns_survived":   pstats.turns_active,
                "survived":         pstats.survived,
                "final_hit":        pstats.final_hit,
                "mvp_score_battle": compute_mvp_score(pstats),
            })

        # Agregar pokémon que no aparecen en el log (ej: suplentes no enviados)
        # Los marcamos con 0s — sí cuentan para el pick rate del equipo
        for player, team in team_map.items():
            for species in team:
                if (player, species) not in seen:
                    records.append({
                        "battle_id":        battle.battle_id,
                        "format":           battle.format,
                        "date":             battle.date,
                        "Player_User":      player,
                        "Pokemon_Used":     species,
                        "won_battle":       battle.winner == player,
                        "kills_in_battle":  0,
                        "turns_survived":   0,
                        "survived":         True,   # no salió → no murió
                        "final_hit":        False,
                        "mvp_score_battle": 0.0,
                    })

    return pd.DataFrame(records)


# ─── Métricas agregadas ────────────────────────────────────────────────────────

def compute_torneo_report(df_raw: pd.DataFrame, total_battles: int) -> pd.DataFrame:
    """
    Agrega las métricas por (Player_User, Pokemon_Used) sobre todas las batallas.

    Output → DataFrame con columnas del reporte final:
      Player_User, Pokemon_Used, Wins, Losses, Total_Kills, MVP_Score, Usage_Rate
    """
    agg = (
        df_raw
        .groupby(["Player_User", "Pokemon_Used"], as_index=False)
        .agg(
            battles_played  = ("battle_id",        "nunique"),
            Wins            = ("won_battle",        "sum"),
            Total_Kills     = ("kills_in_battle",   "sum"),
            MVP_Score       = ("mvp_score_battle",  "sum"),
            times_picked    = ("battle_id",         "count"),  # apariciones totales
        )
    )

    agg["Losses"]     = agg["battles_played"] - agg["Wins"]
    agg["MVP_Score"]  = agg["MVP_Score"].round(2)
    agg["Usage_Rate"] = (agg["times_picked"] / total_battles * 100).round(2)

    return agg[["Player_User", "Pokemon_Used", "Wins", "Losses",
                "Total_Kills", "MVP_Score", "Usage_Rate"]]


def compute_pick_rate(df_raw: pd.DataFrame, total_battles: int) -> pd.DataFrame:
    """
    Pick rate global (todos los jugadores) por especie de pokémon.

    Cuenta en cuántas batallas distintas apareció cada pokémon,
    independientemente de qué jugador lo usó.

    Usage % = (Batallas_en_que_fue_pickeado / Total_Batallas) × 100
    """
    pick = (
        df_raw
        .groupby("Pokemon_Used")["battle_id"]
        .nunique()
        .reset_index(name="battles_used")
    )
    pick["Usage_Rate"] = (pick["battles_used"] / total_battles * 100).round(2)
    pick["Win_Rate"]   = (
        df_raw[df_raw["won_battle"]]
        .groupby("Pokemon_Used")["battle_id"]
        .nunique()
        .reindex(pick["Pokemon_Used"], fill_value=0)
        .values / pick["battles_used"] * 100
    ).round(2)

    return pick.sort_values("Usage_Rate", ascending=False).reset_index(drop=True)


def compute_mvp_leaderboard(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Ranking global de MVP: suma de mvp_score_battle por (jugador, pokémon).
    Útil para identificar al pokémon más dominante del torneo.
    """
    return (
        df_raw
        .groupby(["Player_User", "Pokemon_Used"], as_index=False)
        .agg(
            MVP_Score_Total = ("mvp_score_battle", "sum"),
            Total_Kills     = ("kills_in_battle",  "sum"),
            Battles         = ("battle_id",        "nunique"),
            Final_Hits      = ("final_hit",        "sum"),
        )
        .sort_values("MVP_Score_Total", ascending=False)
        .reset_index(drop=True)
    )


def detect_outliers(pick_rate_df: pd.DataFrame, threshold: float = 70.0) -> pd.DataFrame:
    """
    Identifica pokémon con Pick Rate superior al umbral indicado.
    Estos son candidatos a baneo automático en el torneo.

    Args:
        pick_rate_df: DataFrame con columnas [Pokemon_Used, Usage_Rate].
        threshold:    Porcentaje de uso mínimo para ser flaggeado (default 70%).

    Returns:
        DataFrame filtrado con columna adicional 'ban_reason'.
    """
    outliers = pick_rate_df[pick_rate_df["Usage_Rate"] > threshold].copy()
    outliers["ban_reason"] = outliers["Usage_Rate"].apply(
        lambda r: f"Pick Rate {r:.1f}% supera el umbral de baneo ({threshold:.0f}%)"
    )
    return outliers.reset_index(drop=True)
