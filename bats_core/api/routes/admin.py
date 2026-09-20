"""
BATS — Rutas del panel de administración.

Endpoints:
  POST   /api/admin/login              → valida password, retorna JWT (24h)
  GET    /api/admin/whitelist          → lista jugadores de la temporada activa
  POST   /api/admin/whitelist/add      → agrega jugador al whitelist de la temporada activa
  DELETE /api/admin/whitelist/{hash}   → elimina jugador del whitelist (solo si no ha votado)
  GET    /api/admin/bans               → lista de votos anónimos de la temporada activa
  GET    /api/admin/battles            → lista de batallas humanas
  DELETE /api/admin/battles/{id}       → borra una batalla
  POST   /api/admin/reset-battles      → borra toda la data de batallas
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import create_token, require_admin, verify_password
from ..crypto import hash_username
from ..db import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str


class AddPlayerRequest(BaseModel):
    username: str


# ── Helpers ───────────────────────────────────────────────────────────────────

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
        raise HTTPException(status_code=503, detail="No hay ninguna temporada activa.")
    return int(row["season_id"])


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login")
def login(body: LoginRequest):
    if not verify_password(body.password):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta.")
    return {"access_token": create_token(), "token_type": "bearer"}


@router.get("/whitelist", dependencies=[Depends(require_admin)])
def get_whitelist():
    """Lista jugadores del whitelist de la temporada activa."""
    with get_db() as db:
        row = db.fetchone(
            "SELECT season_id FROM tournament.seasons WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1"
        )
        if row is None:
            return []
        season_id = int(row["season_id"])

        rows = db.fetchall(
            """
            SELECT voter_hash, username, added_at
            FROM tournament.ban_whitelist
            WHERE season_id = %s
            ORDER BY added_at
            """,
            (season_id,),
        )
        participated = {
            r["voter_hash"]
            for r in db.fetchall(
                "SELECT voter_hash FROM tournament.ban_participation WHERE season_id = %s",
                (season_id,),
            )
        }

    return [
        {
            "voter_hash": r["voter_hash"],
            "username":   r["username"],
            "added_at":   r["added_at"].isoformat() if r["added_at"] else None,
            "voted":      r["voter_hash"] in participated,
        }
        for r in rows
    ]


@router.post("/whitelist/add", dependencies=[Depends(require_admin)])
def add_player(body: AddPlayerRequest):
    """Agrega un jugador al whitelist de la temporada activa."""
    username = body.username.strip().lower()
    if not username:
        raise HTTPException(status_code=422, detail="Username vacío.")

    voter_hash = hash_username(username)

    with get_db() as db:
        season_id = _get_active_season_id(db)

        if db.fetchone(
            "SELECT 1 FROM tournament.ban_whitelist WHERE voter_hash = %s AND season_id = %s",
            (voter_hash, season_id),
        ):
            raise HTTPException(status_code=409, detail=f"'{username}' ya está registrado en esta temporada.")

        db.execute(
            "INSERT INTO tournament.ban_whitelist (voter_hash, season_id, username) VALUES (%s, %s, %s)",
            (voter_hash, season_id, username),
        )

    return {"ok": True, "username": username}


@router.delete("/whitelist/{voter_hash}", dependencies=[Depends(require_admin)])
def remove_player(voter_hash: str):
    """Elimina un jugador del whitelist de la temporada activa (solo si no ha votado)."""
    with get_db() as db:
        season_id = _get_active_season_id(db)

        if db.fetchone(
            "SELECT 1 FROM tournament.ban_participation WHERE voter_hash = %s AND season_id = %s",
            (voter_hash, season_id),
        ):
            raise HTTPException(
                status_code=409,
                detail="Este jugador ya votó — no se puede eliminar.",
            )
        db.execute(
            "DELETE FROM tournament.ban_whitelist WHERE voter_hash = %s AND season_id = %s",
            (voter_hash, season_id),
        )

    return {"ok": True}


@router.post("/reset-battles", dependencies=[Depends(require_admin)])
def reset_battles():
    """Borra toda la data de batallas y refresca las vistas materializadas."""
    with get_db() as db:
        db.execute("DELETE FROM battle.etl_log")
        db.execute("DELETE FROM battle.fact_battles")
        db.execute("DELETE FROM battle.dim_players WHERE NOT is_bot")
        db.execute("DELETE FROM battle.dim_formats")
        db.execute("DELETE FROM battle.dim_pokemon")
        db.execute("ALTER SEQUENCE battle.etl_log_log_id_seq RESTART WITH 1")
        db.execute("ALTER SEQUENCE battle.fact_pokemon_performance_perf_id_seq RESTART WITH 1")
        db.execute("ALTER SEQUENCE battle.dim_players_player_id_seq RESTART WITH 1")
        db.execute("ALTER SEQUENCE battle.dim_formats_format_id_seq RESTART WITH 1")
        db.execute("ALTER SEQUENCE battle.dim_pokemon_pokemon_id_seq RESTART WITH 1")
        db.execute("SELECT battle.refresh_bats_views()")
    return {"ok": True}


@router.get("/battles", dependencies=[Depends(require_admin)])
def get_battles():
    """Lista todas las batallas humanas con jugadores y resultado."""
    with get_db() as db:
        rows = db.fetchall(
            """
            SELECT
                fb.battle_id,
                df.format_name,
                fb.battle_date,
                fb.total_turns,
                fb.end_type,
                p1.username   AS p1_username,
                p2.username   AS p2_username,
                w.username    AS winner
            FROM battle.fact_battles fb
            JOIN battle.dim_formats  df ON df.format_id  = fb.format_id
            JOIN battle.dim_players  p1 ON p1.player_id  = fb.p1_id
            JOIN battle.dim_players  p2 ON p2.player_id  = fb.p2_id
            LEFT JOIN battle.dim_players w ON w.player_id = fb.winner_id
            WHERE NOT fb.is_bot_battle
            ORDER BY fb.battle_date DESC, fb.logged_at DESC
            """
        )
    return [
        {**r, "battle_date": r["battle_date"].isoformat() if r["battle_date"] else None}
        for r in rows
    ]


@router.delete("/battles/{battle_id}", dependencies=[Depends(require_admin)])
def delete_battle(battle_id: str):
    """Borra una batalla y sus performances (CASCADE), luego refresca las vistas."""
    with get_db() as db:
        if not db.fetchone(
            "SELECT 1 FROM battle.fact_battles WHERE battle_id = %s AND NOT is_bot_battle",
            (battle_id,),
        ):
            raise HTTPException(status_code=404, detail="Batalla no encontrada.")
        db.execute("DELETE FROM battle.fact_battles WHERE battle_id = %s", (battle_id,))
        db.execute("SELECT battle.refresh_bats_views()")
    return {"ok": True}


@router.get("/bans", dependencies=[Depends(require_admin)])
def get_bans():
    """
    Retorna la temporada activa, lista de pokémon baneados (distintos) y progreso de votación.
    Si no hay temporada activa, retorna season=None, bans=[] y progress=None.
    """
    with get_db() as db:
        season = db.fetchone(
            "SELECT season_id, season_name, type_of_month, start_date, is_active FROM tournament.seasons WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1"
        )
        if season is None:
            return {"season": None, "bans": [], "progress": None}

        season_id = int(season["season_id"])

        bans = db.fetchall(
            """
            SELECT DISTINCT ON (pc.pokemon_id)
                pc.name          AS pokemon_name,
                pc.types         AS pokemon_types,
                pc.sprite_url,
                pc.national_dex
            FROM tournament.ban_votes bv
            JOIN tournament.pokemon_cache pc ON pc.pokemon_id = bv.pokemon_id
            WHERE bv.season_id = %s
            ORDER BY pc.pokemon_id ASC
            """,
            (season_id,),
        )

        authorized = db.fetchone(
            "SELECT COUNT(*) AS n FROM tournament.ban_whitelist WHERE season_id = %s",
            (season_id,),
        )["n"]

        voted = db.fetchone(
            "SELECT COUNT(*) AS n FROM tournament.ban_participation WHERE season_id = %s",
            (season_id,),
        )["n"]

    return {
        "season": {
            "season_id":     season["season_id"],
            "season_name":   season["season_name"],
            "type_of_month": season["type_of_month"],
            "start_date":    season["start_date"].isoformat() if season["start_date"] else None,
            "is_active":     season["is_active"],
        },
        "bans": [dict(r) for r in bans],
        "progress": {"voted": int(voted), "total": int(authorized)},
    }
