"""
BATS — Rutas de estadísticas: MVP top 5, pick rate y bot battles.

Endpoints:
  GET /api/stats/mvp          → top 5 jugadores por total_mvp_score (excluye bot)
  GET /api/stats/pickrate     → pick rate y win rate por especie (excluye batallas bot)
  GET /api/stats/bot/summary  → resumen de rendimiento del jugador vs bot
  GET /api/stats/bot/pokemon  → pokémon más usados contra el bot
  GET /api/stats/bot/battles  → historial de batallas contra el bot
"""
from typing import Optional

from fastapi import APIRouter, Query

from ..db import get_db

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _season_filter(season_id: Optional[int], alias: str = "fb") -> tuple[str, tuple]:
    """Returns (sql_fragment, params) for optional season filtering."""
    if season_id is not None:
        return f"AND {alias}.season_id = %s", (season_id,)
    return "", ()


@router.get("/seasons")
def get_public_seasons():
    """Lista pública de temporadas para el selector de stats."""
    with get_db() as db:
        rows = db.fetchall(
            """
            SELECT season_id, season_name, type_of_month, is_active,
                   start_date, end_date
            FROM tournament.seasons
            ORDER BY created_at DESC
            """
        )
    return [
        {
            "season_id":     r["season_id"],
            "season_name":   r["season_name"],
            "type_of_month": r["type_of_month"],
            "is_active":     r["is_active"],
            "start_date":    r["start_date"].isoformat() if r["start_date"] else None,
            "end_date":      r["end_date"].isoformat()   if r["end_date"]   else None,
        }
        for r in rows
    ]


@router.get("/summary")
def get_summary(season_id: Optional[int] = Query(None)):
    """KPIs globales de la liga (excluye batallas bot). Opcional: ?season_id=X"""
    sf, sp = _season_filter(season_id)

    # top_win_rate: use mv_player_stats when no season filter, inline CTE otherwise
    if season_id is None:
        top_wr_sql = "(SELECT ROUND(MAX(win_rate_pct), 1) FROM battle.mv_player_stats WHERE total_battles >= 3)"
        top_wr_params: tuple = ()
    else:
        top_wr_sql = """
            (SELECT ROUND(MAX(win_pct), 1) FROM (
                SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE fb2.winner_id = dpl2.player_id)
                             / NULLIF(COUNT(*), 0), 1) AS win_pct
                FROM battle.dim_players dpl2
                JOIN battle.fact_battles fb2
                    ON (fb2.p1_id = dpl2.player_id OR fb2.p2_id = dpl2.player_id)
                   AND NOT fb2.is_bot_battle AND fb2.season_id = %s
                WHERE NOT dpl2.is_bot
                GROUP BY dpl2.player_id
                HAVING COUNT(*) >= 3
            ) sub)
        """
        top_wr_params = (season_id,)

    with get_db() as db:
        row = db.fetchone(
            f"""
            SELECT
                COUNT(DISTINCT fb.battle_id)  AS total_battles,
                COUNT(DISTINCT fb.p1_id)
                  + COUNT(DISTINCT fb.p2_id)  AS raw_players,
                ROUND(AVG(fb.total_turns), 1) AS avg_turns,
                {top_wr_sql}                  AS top_win_rate
            FROM battle.fact_battles fb
            WHERE NOT fb.is_bot_battle {sf}
            """,
            top_wr_params + sp,
        )
        players = db.fetchone(
            "SELECT COUNT(*) AS n FROM battle.dim_players WHERE NOT is_bot"
        )
    return {
        "total_battles": row["total_battles"] if row else 0,
        "total_players": players["n"] if players else 0,
        "avg_turns":     float(row["avg_turns"]) if row and row["avg_turns"] else 0,
        "top_win_rate":  float(row["top_win_rate"]) if row and row["top_win_rate"] else 0,
    }


@router.get("/mvp")
def get_mvp_top5(season_id: Optional[int] = Query(None)):
    """Top 5 Pokémon con mayor puntuación MVP acumulada. Opcional: ?season_id=X"""
    sf, sp = _season_filter(season_id)
    with get_db() as db:
        rows = db.fetchall(
            f"""
            SELECT
                dp.species                              AS species,
                dpl.username                            AS player,
                SUM(fpp.mvp_score)                      AS total_mvp_score,
                SUM(fpp.kills)                          AS total_kills,
                SUM(fpp.final_hit::INT)                 AS final_hits,
                COUNT(DISTINCT fpp.battle_id)           AS battles_played,
                ROUND(
                    SUM(fpp.mvp_score)
                    / NULLIF(COUNT(DISTINCT fpp.battle_id), 0),
                    2
                )                                       AS avg_mvp_per_battle
            FROM battle.fact_pokemon_performance fpp
            JOIN battle.fact_battles fb  ON fb.battle_id  = fpp.battle_id
            JOIN battle.dim_pokemon  dp  ON dp.pokemon_id = fpp.pokemon_id
            JOIN battle.dim_players  dpl ON dpl.player_id = fpp.player_id
            WHERE fpp.was_active    = TRUE
              AND NOT fb.is_bot_battle
              AND NOT dpl.is_bot
              {sf}
            GROUP BY dp.species, dpl.username
            ORDER BY total_mvp_score DESC
            LIMIT 5
            """,
            sp,
        )
    return rows


@router.get("/pickrate")
def get_pickrate(season_id: Optional[int] = Query(None)):
    """Pick rate y win rate de las 20 especies más usadas. Opcional: ?season_id=X"""
    with get_db() as db:
        if season_id is None:
            # Fast path: use materialized view
            rows = db.fetchall(
                """
                SELECT
                    species,
                    SUM(battles_used)                                           AS battles_used,
                    SUM(total_slots)                                            AS total_slots,
                    ROUND(100.0 * SUM(battles_used) / NULLIF(SUM(total_slots), 0), 2) AS usage_pct,
                    ROUND(AVG(avg_kills), 2)                                    AS avg_kills,
                    ROUND(AVG(avg_mvp_score), 2)                                AS avg_mvp_score,
                    ROUND(
                        100.0 * SUM(battles_used * win_rate_pct / 100.0)
                              / NULLIF(SUM(battles_used), 0),
                        2
                    )                                                           AS win_rate_pct
                FROM battle.mv_pick_rate
                GROUP BY species
                ORDER BY battles_used DESC
                LIMIT 20
                """
            )
        else:
            # Season-filtered: query base tables (same logic as the materialized view)
            rows = db.fetchall(
                """
                WITH total_slots AS (
                    SELECT COUNT(DISTINCT (fb.battle_id, p.player_id)) AS total_slots
                    FROM battle.fact_battles fb
                    JOIN LATERAL (VALUES (fb.p1_id), (fb.p2_id)) AS p(player_id) ON TRUE
                    JOIN battle.dim_players dpl ON dpl.player_id = p.player_id
                    WHERE NOT fb.is_bot_battle AND NOT dpl.is_bot AND fb.season_id = %s
                )
                SELECT
                    dp.species,
                    COUNT(DISTINCT (fpp.battle_id, fpp.player_id))  AS battles_used,
                    (SELECT total_slots FROM total_slots)            AS total_slots,
                    ROUND(
                        100.0 * COUNT(DISTINCT (fpp.battle_id, fpp.player_id))
                        / NULLIF((SELECT total_slots FROM total_slots), 0), 2
                    )                                               AS usage_pct,
                    ROUND(AVG(fpp.kills), 2)                        AS avg_kills,
                    ROUND(AVG(fpp.mvp_score), 2)                    AS avg_mvp_score,
                    ROUND(
                        100.0 * COUNT(CASE WHEN fb.winner_id = fpp.player_id THEN 1 END)
                        / NULLIF(COUNT(*), 0), 2
                    )                                               AS win_rate_pct
                FROM battle.fact_pokemon_performance fpp
                JOIN battle.fact_battles fb  ON fb.battle_id  = fpp.battle_id
                JOIN battle.dim_pokemon  dp  ON dp.pokemon_id = fpp.pokemon_id
                JOIN battle.dim_players  dpl ON dpl.player_id = fpp.player_id
                WHERE fpp.was_active = TRUE AND NOT fb.is_bot_battle AND NOT dpl.is_bot
                  AND fb.season_id = %s
                GROUP BY dp.species
                ORDER BY battles_used DESC
                LIMIT 20
                """,
                (season_id, season_id),
            )
    return rows


# ── Leaderboard ───────────────────────────────────────────────────────────────

@router.get("/leaderboard")
def get_leaderboard(season_id: Optional[int] = Query(None)):
    """Leaderboard de jugadores con W/L y pokémon sobrevivientes. Opcional: ?season_id=X"""
    sf, sp = _season_filter(season_id)
    with get_db() as db:
        rows = db.fetchall(
            f"""
            SELECT
                dpl.username,
                COUNT(DISTINCT fb.battle_id)                                                      AS total_battles,
                COUNT(DISTINCT fb.battle_id) FILTER (WHERE fb.winner_id = dpl.player_id)          AS wins,
                COUNT(DISTINCT fb.battle_id)
                  - COUNT(DISTINCT fb.battle_id) FILTER (WHERE fb.winner_id = dpl.player_id)      AS losses,
                ROUND(
                    100.0 * COUNT(DISTINCT fb.battle_id) FILTER (WHERE fb.winner_id = dpl.player_id)
                    / NULLIF(COUNT(DISTINCT fb.battle_id), 0), 2
                )                                                                                  AS win_rate_pct,
                COALESCE(SUM(fpp.survived::INT), 0)                                               AS total_survivors
            FROM battle.dim_players dpl
            JOIN battle.fact_battles fb
                ON (fb.p1_id = dpl.player_id OR fb.p2_id = dpl.player_id)
               AND NOT fb.is_bot_battle
               {sf}
            LEFT JOIN battle.fact_pokemon_performance fpp
                ON fpp.battle_id = fb.battle_id
               AND fpp.player_id = dpl.player_id
               AND fpp.survived  = TRUE
            WHERE NOT dpl.is_bot
            GROUP BY dpl.username
            HAVING COUNT(DISTINCT fb.battle_id) > 0
            ORDER BY wins DESC, win_rate_pct DESC
            """,
            sp,
        )
    return rows


# ── Bot Battle Endpoints ───────────────────────────────────────────────────────

@router.get("/bot/summary")
def get_bot_summary():
    """Resumen de rendimiento de cada jugador humano contra el bot."""
    with get_db() as db:
        rows = db.fetchall(
            """
            SELECT
                username,
                total_battles,
                wins,
                total_battles - wins   AS losses,
                win_rate_pct,
                avg_turns
            FROM battle.mv_bot_summary
            ORDER BY total_battles DESC
            """
        )
    return rows


@router.get("/bot/pokemon")
def get_bot_pokemon():
    """Pokémon más usados por jugadores humanos contra el bot."""
    with get_db() as db:
        rows = db.fetchall(
            """
            SELECT
                species,
                username,
                times_used,
                total_kills,
                avg_kills,
                avg_mvp_score,
                total_mvp_score,
                times_survived,
                final_hits,
                survival_pct
            FROM battle.mv_bot_pokemon
            ORDER BY total_mvp_score DESC
            LIMIT 30
            """
        )
    return rows


@router.get("/bot/battles")
def get_bot_battles():
    """Historial de batallas recientes contra el bot."""
    with get_db() as db:
        rows = db.fetchall(
            """
            SELECT
                fb.battle_id,
                df.format_name,
                fb.battle_date,
                dpl_human.username                          AS player,
                fb.winner_id = dpl_human.player_id         AS player_won,
                fb.total_turns                              AS turns,
                fb.end_type
            FROM battle.fact_battles fb
            JOIN battle.dim_formats  df        ON df.format_id  = fb.format_id
            JOIN battle.dim_players  dpl_human ON (dpl_human.player_id = fb.p1_id
                                                OR dpl_human.player_id = fb.p2_id)
                                               AND NOT dpl_human.is_bot
            WHERE fb.is_bot_battle = TRUE
            ORDER BY fb.battle_date DESC, fb.logged_at DESC
            LIMIT 50
            """
        )
    return [
        {**r, "battle_date": r["battle_date"].isoformat() if r["battle_date"] else None}
        for r in rows
    ]


@router.get("/battles/{battle_id}")
def get_battle_details(battle_id: str):
    """Detalle de pokémon de cualquier batalla (jugador vs jugador)."""
    with get_db() as db:
        rows = db.fetchall(
            """
            SELECT
                dpl.username                            AS player,
                dp.species                              AS species,
                fpp.kills                               AS kills,
                fpp.survived                            AS survived,
                fpp.final_hit                           AS final_hit,
                fpp.mvp_score                           AS mvp_score
            FROM battle.fact_pokemon_performance fpp
            JOIN battle.dim_pokemon dp  ON dp.pokemon_id = fpp.pokemon_id
            JOIN battle.dim_players dpl ON dpl.player_id = fpp.player_id
            WHERE fpp.battle_id = %s
            ORDER BY fpp.mvp_score DESC
            """,
            (battle_id,)
        )
    return rows


@router.get("/bot/battles/{battle_id}")
def get_bot_battle_details(battle_id: str):
    """Obtiene el detalle de los 12 Pokémon que participaron en una batalla específica contra el bot."""
    with get_db() as db:
        rows = db.fetchall(
            """
            SELECT
                dpl.username                            AS player,
                dp.species                              AS species,
                fpp.kills                               AS kills,
                fpp.survived                            AS survived,
                fpp.final_hit                           AS final_hit,
                fpp.mvp_score                           AS mvp_score
            FROM battle.fact_pokemon_performance fpp
            JOIN battle.dim_pokemon dp  ON dp.pokemon_id = fpp.pokemon_id
            JOIN battle.dim_players dpl ON dpl.player_id = fpp.player_id
            WHERE fpp.battle_id = %s
            ORDER BY dpl.is_bot ASC, fpp.mvp_score DESC
            """,
            (battle_id,)
        )
    return rows
