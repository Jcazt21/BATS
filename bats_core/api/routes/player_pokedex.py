"""
BATS — Pokédex pública de cada jugador.

Endpoints:
  GET /api/players/{username}/pokedex → especies que el jugador vio salir al campo en batallas
                                        de liga, de la más reciente a la más antigua

Solo devuelve los hechos de tournament.pokedex_seen (v13). La agrupación por número nacional,
las preevoluciones descubiertas y el progreso los calcula el frontend con el dex estático.
"""
from fastapi import APIRouter, HTTPException

from ..common import iso
from ..db import get_db

router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("/{username}/pokedex")
def get_player_pokedex(username: str):
    user = username.strip().lower()
    with get_db() as db:
        rows = db.fetchall(
            """
            SELECT species_id, species, first_seen_at, battle_id, opponent
            FROM tournament.pokedex_seen
            WHERE username = %s
            ORDER BY first_seen_at DESC, species_id
            """,
            (user,),
        )
        # Sin avistamientos: 200 vacío si el jugador existe (tiene cuenta), 404 si no.
        if not rows and not db.fetchone(
            "SELECT 1 FROM tournament.player_accounts WHERE LOWER(username) = %s", (user,)
        ):
            raise HTTPException(status_code=404, detail="Jugador no encontrado.")
    return {
        "username": user,
        "seen": [
            {
                "species_id": r["species_id"], "species": r["species"], "first_seen_at": iso(r["first_seen_at"]),
                "battle_id": r["battle_id"], "opponent": r["opponent"],
            }
            for r in rows
        ],
    }
