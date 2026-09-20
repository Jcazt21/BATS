"""
BATS — Rutas de votación anónima de bans.

Endpoints:
  POST /api/ban/check-user   → valida si el username puede votar en la temporada activa
  POST /api/ban/submit       → registra el voto (anónimo) en la temporada activa
  GET  /api/ban/ranking      → ranking de pokémon más votados
  GET  /api/ban/status       → estado general de la votación
  GET  /api/ban/active       → pokémon votados en la temporada activa (lo consume PS)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..crypto import hash_username
from ..db import get_db

router = APIRouter(prefix="/api/ban", tags=["ban"])


class CheckUserRequest(BaseModel):
    username: str


class SubmitBanRequest(BaseModel):
    username:      str
    pokemon_name:  str
    pokemon_types: str | None = None
    sprite_url:    str | None = None
    national_dex:  int | None = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_active_season_id(db) -> int:
    row = db.fetchone(
        """
        SELECT season_id FROM tournament.seasons
        WHERE is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1
        """
    )
    if row is None:
        raise HTTPException(status_code=503, detail="No hay ninguna temporada de votación activa.")
    return int(row["season_id"])


def _upsert_pokemon(db, name: str, national_dex: int | None, types: str | None, sprite_url: str | None) -> int:
    """Upsertea en pokemon_cache y retorna el pokemon_id."""
    row = db.fetchone(
        "SELECT tournament.upsert_pokemon_cache(%s, %s, %s, %s) AS pokemon_id",
        (name, national_dex, types, sprite_url),
    )
    return int(row["pokemon_id"])


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/check-user")
def check_user(body: CheckUserRequest):
    voter_hash = hash_username(body.username)

    with get_db() as db:
        season_id = _get_active_season_id(db)

        in_whitelist = db.fetchone(
            """
            SELECT EXISTS(
                SELECT 1 FROM tournament.ban_whitelist
                WHERE voter_hash = %s AND season_id = %s
            ) AS val
            """,
            (voter_hash, season_id),
        )["val"]

        already_voted = db.fetchone(
            """
            SELECT EXISTS(
                SELECT 1 FROM tournament.ban_participation
                WHERE voter_hash = %s AND season_id = %s
            ) AS val
            """,
            (voter_hash, season_id),
        )["val"]

    if not in_whitelist:
        return {"can_vote": False, "reason": "not_registered"}
    if already_voted:
        return {"can_vote": False, "reason": "already_voted"}
    return {"can_vote": True, "reason": None}


@router.post("/submit")
def submit_ban(body: SubmitBanRequest):
    voter_hash = hash_username(body.username)

    with get_db() as db:
        season_id = _get_active_season_id(db)

        can = db.fetchone(
            "SELECT tournament.can_vote(%s, %s) AS val",
            (voter_hash, season_id),
        )["val"]
        if not can:
            raise HTTPException(status_code=403, detail="No autorizado o ya registraste tu ban.")

        pokemon_id = _upsert_pokemon(
            db,
            body.pokemon_name,
            body.national_dex,
            body.pokemon_types,
            body.sprite_url,
        )

        db.execute(
            "INSERT INTO tournament.ban_votes (season_id, pokemon_id) VALUES (%s, %s)",
            (season_id, pokemon_id),
        )

        db.execute(
            "INSERT INTO tournament.ban_participation (voter_hash, season_id) VALUES (%s, %s)",
            (voter_hash, season_id),
        )

    return {"ok": True, "message": "Ban registrado exitosamente."}


@router.get("/ranking")
def get_ranking():
    with get_db() as db:
        rows = db.fetchall("SELECT * FROM tournament.v_ban_ranking")
    return rows


@router.get("/status")
def get_status():
    with get_db() as db:
        season_id = _get_active_season_id(db)

        authorized = db.fetchone(
            "SELECT COUNT(*) AS n FROM tournament.ban_whitelist WHERE season_id = %s",
            (season_id,),
        )["n"]

        voted = db.fetchone(
            "SELECT COUNT(*) AS n FROM tournament.ban_participation WHERE season_id = %s",
            (season_id,),
        )["n"]

        votes_cast = db.fetchone(
            "SELECT COUNT(*) AS n FROM tournament.ban_votes WHERE season_id = %s",
            (season_id,),
        )["n"]

    return {
        "total_authorized": authorized,
        "total_voted":      voted,
        "total_votes_cast": votes_cast,
        "voting_open":      voted < authorized,
    }


@router.get("/active")
def get_active_bans():
    """
    Nombres de los pokémon votados en la temporada activa.

    Reemplaza al active_bans.json que la API escribía en disco al votar (imposible
    en serverless: el filesystem es de solo lectura). El server de PS consulta
    este endpoint y escribe su propio active_bans.json local, que leen
    config/formats.ts y el PGL-Bot.

    Es información agregada y ya pública vía /ranking: no expone quién votó.
    """
    with get_db() as db:
        season_id = _get_active_season_id(db)
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
    return {"season_id": season_id, "bans": [r["pokemon_name"] for r in rows]}
