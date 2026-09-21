"""
BATS API — Helpers compartidos por las rutas.

Antes cada router traía su copia de estos helpers (con mensajes de error y códigos
distintos): get_active_season triplicado, upsert de pokémon con dos firmas, y el
`x.isoformat() if x else None` repetido en todos lados.
"""
import json
from datetime import date, datetime
from typing import Any, Optional

from fastapi import HTTPException


def iso(value: Optional[date | datetime]) -> Optional[str]:
    """Fecha/hora → ISO 8601, o None."""
    return value.isoformat() if value else None


def get_active_season(db) -> dict:
    """
    Temporada activa completa (con `restrictions` ya parseado como dict).
    Lanza 404 si no hay ninguna.
    """
    row = db.fetchone(
        """
        SELECT season_id, season_name, type_of_month, max_team_size, max_team_changes, restrictions
        FROM tournament.seasons
        WHERE is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1
        """
    )
    if not row:
        raise HTTPException(status_code=404, detail="No hay temporada activa.")
    season = dict(row)
    restrictions: Any = season.get("restrictions")
    if isinstance(restrictions, str):     # psycopg2 puede devolver JSONB como str
        restrictions = json.loads(restrictions)
    season["restrictions"] = restrictions or {}
    return season


def get_active_season_id(db) -> int:
    return int(get_active_season(db)["season_id"])


def upsert_pokemon(
    db,
    name: str,
    national_dex: Optional[int] = None,
    types: Optional[str] = None,
    sprite_url: Optional[str] = None,
    color: Optional[str] = None,
    generation: Optional[int] = None,
) -> int:
    """
    Upsert en tournament.pokemon_cache y devuelve el pokemon_id.
    color/generation nulos NO pisan los valores ya guardados (COALESCE en v6.sql).
    """
    row = db.fetchone(
        "SELECT tournament.upsert_pokemon_cache(%s, %s, %s, %s, %s, %s::smallint) AS pokemon_id",
        (name, national_dex, types, sprite_url, color, generation),
    )
    return int(row["pokemon_id"])


def voted_ban_names(db, season_id: int) -> list[str]:
    """Nombres de los pokémon votados como ban en la temporada (sin duplicados, ordenados)."""
    rows = db.fetchall(
        """
        SELECT DISTINCT pc.name AS pokemon_name
        FROM tournament.ban_votes bv
        JOIN tournament.pokemon_cache pc ON pc.pokemon_id = bv.pokemon_id
        WHERE bv.season_id = %s
        ORDER BY pc.name
        """,
        (season_id,),
    )
    return [r["pokemon_name"] for r in rows]
