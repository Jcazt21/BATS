"""
BATS — Rutas de estadísticas: MVP top 5, pick rate y bot battles.

Endpoints:
  GET /api/stats/mvp          → top 5 jugadores por total_mvp_score (excluye bot)
  GET /api/stats/pickrate     → pick rate y win rate por especie (excluye batallas bot)

mvp, pickrate y leaderboard leen SIEMPRE las vistas materializadas (con o sin
?season_id=); no recalculan la métrica sobre las tablas base. Las vistas las refresca
POST /api/ingest/refresh-views y un cron diario.
  GET /api/stats/bot/summary  → resumen de rendimiento del jugador vs bot
  GET /api/stats/bot/pokemon  → pokémon más usados contra el bot
  GET /api/stats/bot/battles  → historial de batallas contra el bot
"""
from typing import Optional

from fastapi import APIRouter, Query

from ..common import iso
from ..db import get_db

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _season_filter(season_id: Optional[int], alias: str = "fb") -> tuple[str, tuple]:
    """Returns (sql_fragment, params) for optional season filtering."""
    if season_id is not None:
        return f"AND {alias}.season_id = %s", (season_id,)
    return "", ()


def _mv_season(season_id: Optional[int]) -> tuple[str, tuple]:
    """Filtro de temporada para las vistas materializadas (season_id = 0 → sin temporada)."""
    if season_id is not None:
        return "WHERE season_id = %s", (season_id,)
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
            "start_date":    iso(r["start_date"]),
            "end_date":      iso(r["end_date"]),
        }
        for r in rows
    ]


@router.get("/summary")
def get_summary(season_id: Optional[int] = Query(None)):
    """KPIs globales de la liga (excluye batallas bot). Opcional: ?season_id=X"""
    sf, sp = _season_filter(season_id)

    mvf, mvp = _mv_season(season_id)
    top_wr_sql = f"""
        (SELECT ROUND(MAX(win_pct), 1) FROM (
            SELECT 100.0 * SUM(wins) / NULLIF(SUM(total_battles), 0) AS win_pct
            FROM battle.mv_player_stats
            {mvf}
            GROUP BY username
            HAVING SUM(total_battles) >= 3
        ) sub)
    """
    top_wr_params: tuple = mvp

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
    mvf, mvp = _mv_season(season_id)
    with get_db() as db:
        rows = db.fetchall(
            f"""
            SELECT
                species,
                username                                            AS player,
                SUM(total_mvp_score)                                AS total_mvp_score,
                SUM(total_kills)                                    AS total_kills,
                SUM(final_hits)                                     AS final_hits,
                SUM(battles_used)                                   AS battles_played,
                ROUND(SUM(total_mvp_score) / NULLIF(SUM(battles_used), 0), 2) AS avg_mvp_per_battle
            FROM battle.mv_mvp_leaderboard
            {mvf}
            GROUP BY species, username
            ORDER BY total_mvp_score DESC
            LIMIT 5
            """,
            mvp,
        )
    return rows


@router.get("/pickrate")
def get_pickrate(season_id: Optional[int] = Query(None)):
    """Pick rate y win rate de las 20 especies más usadas. Opcional: ?season_id=X"""
    mvf, mvp = _mv_season(season_id)
    with get_db() as db:
        rows = db.fetchall(
            f"""
            WITH slots AS (
                -- Denominador exacto: cada (temporada, formato) cuenta una sola vez,
                -- aunque la especie no haya aparecido en él.
                SELECT SUM(total_slots) AS n FROM (
                    SELECT DISTINCT season_id, format_name, total_slots
                    FROM battle.mv_pick_rate
                    {mvf}
                ) s
            )
            SELECT
                species,
                SUM(battles_used)                                              AS battles_used,
                (SELECT n FROM slots)                                          AS total_slots,
                ROUND(100.0 * SUM(battles_used) / NULLIF((SELECT n FROM slots), 0), 2) AS usage_pct,
                ROUND(SUM(total_kills)     / NULLIF(SUM(rows_used), 0), 2)     AS avg_kills,
                ROUND(SUM(total_mvp_score) / NULLIF(SUM(rows_used), 0), 2)     AS avg_mvp_score,
                ROUND(100.0 * SUM(wins)    / NULLIF(SUM(rows_used), 0), 2)     AS win_rate_pct
            FROM battle.mv_pick_rate
            {mvf}
            GROUP BY species
            ORDER BY battles_used DESC
            LIMIT 20
            """,
            mvp + mvp,
        )
    return rows


# ── Leaderboard ───────────────────────────────────────────────────────────────

@router.get("/leaderboard")
def get_leaderboard(season_id: Optional[int] = Query(None)):
    """Leaderboard de jugadores con W/L y pokémon sobrevivientes. Opcional: ?season_id=X"""
    mvf, mvp = _mv_season(season_id)
    with get_db() as db:
        rows = db.fetchall(
            f"""
            SELECT
                username,
                SUM(total_battles)                                       AS total_battles,
                SUM(wins)                                                AS wins,
                SUM(total_battles) - SUM(wins)                           AS losses,
                ROUND(100.0 * SUM(wins) / NULLIF(SUM(total_battles), 0), 2) AS win_rate_pct,
                SUM(total_survivors)                                     AS total_survivors
            FROM battle.mv_player_stats
            {mvf}
            GROUP BY username
            HAVING SUM(total_battles) > 0
            ORDER BY wins DESC, win_rate_pct DESC
            """,
            mvp,
        )
    return rows


# ── Actividad reciente ────────────────────────────────────────────────────────

@router.get("/recent-battles")
def get_recent_battles(season_id: Optional[int] = Query(None), limit: int = Query(8, ge=1, le=50)):
    """Últimas batallas entre jugadores (sin bots) para el feed del inicio. Opcional: ?season_id=X"""
    sf, sp = _season_filter(season_id)
    with get_db() as db:
        rows = db.fetchall(
            f"""
            SELECT fb.battle_id, fb.battle_date, fb.total_turns, fb.end_type, fb.logged_at,
                   p1.username AS p1, p2.username AS p2, w.username AS winner
            FROM battle.fact_battles fb
            JOIN battle.dim_players p1 ON p1.player_id = fb.p1_id
            JOIN battle.dim_players p2 ON p2.player_id = fb.p2_id
            LEFT JOIN battle.dim_players w ON w.player_id = fb.winner_id
            WHERE NOT fb.is_bot_battle AND NOT p1.is_bot AND NOT p2.is_bot {sf}
            ORDER BY fb.battle_date DESC, fb.logged_at DESC
            LIMIT %s
            """,
            sp + (limit,),
        )
    return [
        {
            "battle_id": r["battle_id"],
            "date": iso(r["battle_date"]),
            "winner": r["winner"],
            # Empate: sin ganador, `loser` también va vacío.
            "loser": None if r["winner"] is None else (r["p2"] if r["winner"] == r["p1"] else r["p1"]),
            "players": [r["p1"], r["p2"]],
            "turns": r["total_turns"],
            "end_type": r["end_type"],
        }
        for r in rows
    ]


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
        {**r, "battle_date": iso(r["battle_date"])}
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
