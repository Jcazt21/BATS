"""
BATS — Pokédex pública de cada jugador.

Endpoints:
  GET /api/players/{username}/pokedex → especies que el jugador vio salir al campo en batallas
                                        de liga, de la más reciente a la más antigua
  GET /api/stats/collectors           → lo mismo para cada jugador con al menos un avistamiento
                                        (ranking de coleccionistas; no depende de la temporada)

Solo devuelve los hechos de tournament.pokedex_seen (v14). La agrupación por número nacional,
las preevoluciones descubiertas y el progreso los calcula el frontend con el dex estático.
"""
from fastapi import APIRouter, HTTPException

from ..common import iso
from ..db import get_db

router = APIRouter(prefix="/api/players", tags=["players"])
stats_router = APIRouter(prefix="/api/stats", tags=["stats"])

_SEEN_COLS = "username, species_id, species, first_seen_at, battle_id, opponent"


def _sighting(r) -> dict:
    return {
        "species_id": r["species_id"], "species": r["species"], "first_seen_at": iso(r["first_seen_at"]),
        "battle_id": r["battle_id"], "opponent": r["opponent"],
    }


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
        if not rows and not db.fetchone(
            """
            SELECT 1 FROM tournament.player_accounts WHERE LOWER(username) = %s
            UNION ALL
            SELECT 1 FROM battle.dim_players WHERE LOWER(username) = %s
            LIMIT 1
            """,
            (user, user),
        ):
            raise HTTPException(status_code=404, detail="Jugador no encontrado.")
    return {
        "username": user,
        "seen": [_sighting(r) for r in rows],
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
