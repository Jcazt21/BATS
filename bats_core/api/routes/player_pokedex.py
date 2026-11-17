"""
BATS — Pokédex pública de cada jugador.

Endpoints:
  GET /api/players/{username}/pokedex       → especies que el jugador vio salir al campo en
                                              batallas de liga, de la más reciente a la más antigua
  GET /api/players/{username}/pokedex/stats → estadísticas acumuladas del jugador por especie
                                              (usadas y enfrentadas en batallas de liga)
  GET /api/stats/collectors                 → lo mismo para cada jugador con al menos un avistamiento
                                              (ranking de coleccionistas; no depende de la temporada)

Solo devuelve los hechos de tournament.pokedex_seen (v14) y battle.*. La agrupación por número
nacional, las preevoluciones descubiertas y el progreso los calcula el frontend con el dex estático.
"""
from fastapi import APIRouter, HTTPException

from ...league import LEAGUE_FORMAT
from ..common import iso
from ..db import get_db

router = APIRouter(prefix="/api/players", tags=["players"])
stats_router = APIRouter(prefix="/api/stats", tags=["stats"])

_SEEN_COLS = "username, species_id, species, first_seen_at, battle_id, opponent"

# Mismo filtro que _POKEDEX_SEEN_SQL: formato de liga, sin bot y solo filas was_active.
_PLAYER_POKEDEX_STATS_SQL = """
    WITH player_battles AS (
        SELECT fb.battle_id,
               fb.battle_date,
               fb.winner_id,
               p1.player_id AS me_id,
               p2.player_id AS opp_id,
               LOWER(p2.username) AS opponent
        FROM battle.fact_battles fb
        JOIN battle.dim_formats df ON df.format_id = fb.format_id
        JOIN battle.dim_players p1 ON p1.player_id = fb.p1_id
        JOIN battle.dim_players p2 ON p2.player_id = fb.p2_id
        WHERE df.format_name = %s
          AND NOT fb.is_bot_battle
          AND LOWER(p1.username) = %s
        UNION ALL
        SELECT fb.battle_id,
               fb.battle_date,
               fb.winner_id,
               p2.player_id AS me_id,
               p1.player_id AS opp_id,
               LOWER(p1.username) AS opponent
        FROM battle.fact_battles fb
        JOIN battle.dim_formats df ON df.format_id = fb.format_id
        JOIN battle.dim_players p1 ON p1.player_id = fb.p1_id
        JOIN battle.dim_players p2 ON p2.player_id = fb.p2_id
        WHERE df.format_name = %s
          AND NOT fb.is_bot_battle
          AND LOWER(p2.username) = %s
          AND fb.p1_id <> fb.p2_id
    ),
    perf AS (
        SELECT dp.species,
               pb.battle_id,
               pb.battle_date,
               pb.opponent,
               COALESCE(pb.winner_id = pb.me_id, FALSE) AS won,
               (fpp.player_id = pb.me_id) AS is_used,
               fpp.kills,
               fpp.mvp_score,
               ROW_NUMBER() OVER (
                   PARTITION BY dp.species, (fpp.player_id = pb.me_id)
                   ORDER BY fpp.mvp_score DESC, fpp.kills DESC, pb.battle_date DESC, pb.battle_id DESC
               ) AS rn
        FROM player_battles pb
        JOIN battle.fact_pokemon_performance fpp
          ON fpp.battle_id = pb.battle_id
         AND fpp.was_active
         AND fpp.player_id IN (pb.me_id, pb.opp_id)
        JOIN battle.dim_pokemon dp ON dp.pokemon_id = fpp.pokemon_id
    )
    SELECT species,
           COUNT(DISTINCT battle_id) FILTER (WHERE is_used) AS used_battles,
           COALESCE(SUM(kills) FILTER (WHERE is_used), 0) AS used_kills,
           COALESCE(SUM(mvp_score) FILTER (WHERE is_used), 0) AS used_mvp,
           MAX(battle_id) FILTER (WHERE is_used AND rn = 1) AS best_battle_id,
           MAX(kills) FILTER (WHERE is_used AND rn = 1) AS best_kills,
           MAX(mvp_score) FILTER (WHERE is_used AND rn = 1) AS best_mvp,
           MAX(opponent) FILTER (WHERE is_used AND rn = 1) AS best_opponent,
           MAX(battle_date) FILTER (WHERE is_used AND rn = 1) AS best_date,
           COUNT(DISTINCT battle_id) FILTER (WHERE NOT is_used) AS faced_battles,
           COALESCE(SUM(kills) FILTER (WHERE NOT is_used), 0) AS faced_kills_against,
           COUNT(DISTINCT battle_id) FILTER (WHERE NOT is_used AND won) AS faced_wins
    FROM perf
    GROUP BY species
    ORDER BY species
"""


def _sighting(r) -> dict:
    return {
        "species_id": r["species_id"], "species": r["species"], "first_seen_at": iso(r["first_seen_at"]),
        "battle_id": r["battle_id"], "opponent": r["opponent"],
    }


def _player_exists(db, user: str) -> bool:
    return bool(db.fetchone(
        """
        SELECT 1 FROM tournament.player_accounts WHERE LOWER(username) = %s
        UNION ALL
        SELECT 1 FROM battle.dim_players WHERE LOWER(username) = %s
        LIMIT 1
        """,
        (user, user),
    ))


def _species_stats(r) -> dict:
    used = None
    if r["used_battles"]:
        used = {
            "battles": int(r["used_battles"]),
            "kills": int(r["used_kills"]),
            "mvp": float(r["used_mvp"]),
            "best": {
                "battle_id": r["best_battle_id"],
                "kills": int(r["best_kills"]),
                "mvp": float(r["best_mvp"]),
                "opponent": r["best_opponent"],
                "date": iso(r["best_date"]),
            },
        }
    faced = None
    if r["faced_battles"]:
        faced = {
            "battles": int(r["faced_battles"]),
            "kills_against": int(r["faced_kills_against"]),
            "wins": int(r["faced_wins"]),
        }
    return {"species": r["species"], "used": used, "faced": faced}


@router.get("/{username}/pokedex")
def get_player_pokedex(username: str):
    user = username.strip().lower()
    with get_db() as db:
        rows = db.fetchall(
            f"""
            SELECT {_SEEN_COLS}
            FROM tournament.pokedex_seen
            WHERE username = %s
            ORDER BY first_seen_at DESC, species_id
            """,
            (user,),
        )
        # Sin avistamientos: 200 vacío si el jugador existe (tiene cuenta o ya jugó batallas,
        # es decir, tiene perfil público), 404 si no.
        if not rows and not _player_exists(db, user):
            raise HTTPException(status_code=404, detail="Jugador no encontrado.")
    return {
        "username": user,
        "seen": [_sighting(r) for r in rows],
    }


@router.get("/{username}/pokedex/stats")
def get_player_pokedex_stats(username: str):
    user = username.strip().lower()
    with get_db() as db:
        rows = db.fetchall(
            _PLAYER_POKEDEX_STATS_SQL,
            (LEAGUE_FORMAT, user, LEAGUE_FORMAT, user),
        )
        if not rows and not _player_exists(db, user):
            raise HTTPException(status_code=404, detail="Jugador no encontrado.")
    return {
        "username": user,
        "species": [_species_stats(r) for r in rows],
    }


@stats_router.get("/collectors")
def get_collectors():
    with get_db() as db:
        rows = db.fetchall(
            f"""
            SELECT {_SEEN_COLS}
            FROM tournament.pokedex_seen
            ORDER BY username, first_seen_at DESC, species_id
            """
        )
    collectors: dict[str, list[dict]] = {}
    for r in rows:
        collectors.setdefault(r["username"], []).append(_sighting(r))
    return [{"username": u, "seen": seen} for u, seen in collectors.items()]
