"""
BATS — Rutas de gestión de temporadas.

Endpoints:
  GET    /api/admin/seasons                          → lista todas las temporadas
  POST   /api/admin/seasons                          → crea una nueva temporada
  PATCH  /api/admin/seasons/{id}/activate            → activa una temporada (desactiva las demás)
  PATCH  /api/admin/seasons/{id}/close               → cierra una temporada (end_date + is_active=False)
  DELETE /api/admin/seasons/{id}                     → elimina temporada (solo si está vacía)

  GET    /api/admin/seasons/{id}/bans                → bans oficiales de la temporada
  POST   /api/admin/seasons/{id}/bans                → registra un ban oficial
  DELETE /api/admin/seasons/{id}/bans/{ban_id}       → revoca un ban oficial

  GET    /api/admin/seasons/{id}/votes               → ranking de votos de la temporada
  GET    /api/admin/seasons/{id}/whitelist            → whitelist de la temporada
"""
import json
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_admin
from ..db import get_db

router = APIRouter(prefix="/api/admin/seasons", tags=["seasons"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateSeasonRequest(BaseModel):
    season_name:      str
    type_of_month:    str
    start_date:       date
    max_team_size:    int = 8
    max_team_changes: int = 4
    restrictions:     dict = {}


class UpdateSeasonRequest(BaseModel):
    season_name:      str | None  = None
    type_of_month:    str | None  = None
    start_date:       date | None = None
    end_date:         date | None = None   # enviar None explícito borra la fecha
    clear_end_date:   bool        = False  # True → poner end_date = NULL
    is_active:        bool | None = None
    max_team_size:    Optional[int]  = None
    max_team_changes: Optional[int]  = None
    restrictions:     Optional[dict] = None


class AddBanRequest(BaseModel):
    player_username: str
    pokemon_name:    str  # debe existir en tournament.pokemon_cache


# ── Helpers ───────────────────────────────────────────────────────────────────

def _season_or_404(db, season_id: int) -> dict:
    row = db.fetchone(
        "SELECT * FROM tournament.seasons WHERE season_id = %s",
        (season_id,),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Temporada no encontrada.")
    return row


def _has_data(db, season_id: int) -> bool:
    votes = db.fetchone(
        "SELECT EXISTS(SELECT 1 FROM tournament.ban_votes WHERE season_id = %s) AS v",
        (season_id,),
    )["v"]
    bans = db.fetchone(
        "SELECT EXISTS(SELECT 1 FROM tournament.bans WHERE season_id = %s) AS v",
        (season_id,),
    )["v"]
    return votes or bans


def _serialize(row: dict) -> dict:
    restrictions = row.get("restrictions") or {}
    if isinstance(restrictions, str):
        try:
            restrictions = json.loads(restrictions)
        except (ValueError, TypeError):
            restrictions = {}
    return {
        "season_id":        row["season_id"],
        "season_name":      row["season_name"],
        "type_of_month":    row["type_of_month"],
        "start_date":       row["start_date"].isoformat() if row["start_date"] else None,
        "end_date":         row["end_date"].isoformat()   if row["end_date"]   else None,
        "is_active":        row["is_active"],
        "created_at":       row["created_at"].isoformat() if row["created_at"] else None,
        "max_team_size":    row.get("max_team_size", 8),
        "max_team_changes": row.get("max_team_changes", 4),
        "restrictions":     restrictions,
    }


# ── Season CRUD ───────────────────────────────────────────────────────────────

@router.get("", dependencies=[Depends(require_admin)])
def list_seasons():
    with get_db() as db:
        rows = db.fetchall(
            """
            SELECT
                s.*,
                COUNT(DISTINCT bv.vote_id) AS total_votes,
                COUNT(DISTINCT b.ban_id)   AS total_bans
            FROM tournament.seasons s
            LEFT JOIN tournament.ban_votes bv ON bv.season_id = s.season_id
            LEFT JOIN tournament.bans      b  ON b.season_id  = s.season_id
            GROUP BY s.season_id
            ORDER BY s.created_at DESC
            """
        )
    return [
        {**_serialize(r), "total_votes": r["total_votes"], "total_bans": r["total_bans"]}
        for r in rows
    ]


@router.post("", dependencies=[Depends(require_admin)], status_code=201)
def create_season(body: CreateSeasonRequest):
    name = body.season_name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="El nombre no puede estar vacío.")

    with get_db() as db:
        if db.fetchone(
            "SELECT 1 FROM tournament.seasons WHERE LOWER(season_name) = LOWER(%s)", (name,)
        ):
            raise HTTPException(status_code=409, detail=f"Ya existe una temporada llamada '{name}'.")

        db.execute(
            """
            INSERT INTO tournament.seasons
                (season_name, type_of_month, start_date, is_active, max_team_size, max_team_changes, restrictions)
            VALUES (%s, %s, %s, FALSE, %s, %s, %s::jsonb)
            """,
            (name, body.type_of_month.strip(), body.start_date,
             body.max_team_size, body.max_team_changes, json.dumps(body.restrictions)),
        )
        row = db.fetchone("SELECT * FROM tournament.seasons WHERE season_name = %s", (name,))

    return _serialize(row)


@router.patch("/{season_id}", dependencies=[Depends(require_admin)])
def update_season(season_id: int, body: UpdateSeasonRequest):
    """Edita nombre, tipo, fechas o estado de una temporada."""
    with get_db() as db:
        _season_or_404(db, season_id)

        fields, values = [], []

        if body.season_name is not None:
            name = body.season_name.strip()
            if not name:
                raise HTTPException(status_code=422, detail="El nombre no puede estar vacío.")
            conflict = db.fetchone(
                "SELECT 1 FROM tournament.seasons WHERE LOWER(season_name) = LOWER(%s) AND season_id != %s",
                (name, season_id),
            )
            if conflict:
                raise HTTPException(status_code=409, detail=f"Ya existe una temporada llamada '{name}'.")
            fields.append("season_name = %s"); values.append(name)

        if body.type_of_month is not None:
            fields.append("type_of_month = %s"); values.append(body.type_of_month.strip())

        if body.start_date is not None:
            fields.append("start_date = %s"); values.append(body.start_date)

        if body.clear_end_date:
            fields.append("end_date = NULL")
        elif body.end_date is not None:
            fields.append("end_date = %s"); values.append(body.end_date)

        if body.is_active is not None:
            if body.is_active:
                # Desactivar todas antes de activar esta
                db.execute("UPDATE tournament.seasons SET is_active = FALSE")
            fields.append("is_active = %s"); values.append(body.is_active)

        if body.max_team_size is not None:
            fields.append("max_team_size = %s"); values.append(body.max_team_size)

        if body.max_team_changes is not None:
            fields.append("max_team_changes = %s"); values.append(body.max_team_changes)

        if body.restrictions is not None:
            fields.append("restrictions = %s::jsonb"); values.append(json.dumps(body.restrictions))

        if not fields:
            raise HTTPException(status_code=422, detail="Sin campos para actualizar.")

        values.append(season_id)
        db.execute(
            f"UPDATE tournament.seasons SET {', '.join(fields)} WHERE season_id = %s",
            tuple(values),
        )
        updated = db.fetchone("SELECT * FROM tournament.seasons WHERE season_id = %s", (season_id,))

    return _serialize(updated)


@router.patch("/{season_id}/activate", dependencies=[Depends(require_admin)])
def activate_season(season_id: int):
    with get_db() as db:
        season = _season_or_404(db, season_id)
        if season["is_active"]:
            return {**_serialize(season), "message": "La temporada ya estaba activa."}

        db.execute("UPDATE tournament.seasons SET is_active = FALSE")
        db.execute("UPDATE tournament.seasons SET is_active = TRUE WHERE season_id = %s", (season_id,))
        updated = db.fetchone("SELECT * FROM tournament.seasons WHERE season_id = %s", (season_id,))

    return _serialize(updated)


@router.patch("/{season_id}/close", dependencies=[Depends(require_admin)])
def close_season(season_id: int):
    with get_db() as db:
        season = _season_or_404(db, season_id)
        if not season["is_active"]:
            raise HTTPException(status_code=409, detail="La temporada ya está cerrada.")

        db.execute(
            "UPDATE tournament.seasons SET is_active = FALSE, end_date = CURRENT_DATE WHERE season_id = %s",
            (season_id,),
        )
        updated = db.fetchone("SELECT * FROM tournament.seasons WHERE season_id = %s", (season_id,))

    return _serialize(updated)


@router.delete("/{season_id}", dependencies=[Depends(require_admin)])
def delete_season(season_id: int):
    with get_db() as db:
        _season_or_404(db, season_id)
        if _has_data(db, season_id):
            raise HTTPException(
                status_code=409,
                detail="No se puede eliminar una temporada con votos o bans registrados.",
            )
        db.execute("DELETE FROM tournament.seasons WHERE season_id = %s", (season_id,))

    return {"ok": True}


# ── Season Bans ───────────────────────────────────────────────────────────────

@router.get("/{season_id}/bans", dependencies=[Depends(require_admin)])
def get_season_bans(season_id: int):
    """Bans oficiales registrados para la temporada."""
    with get_db() as db:
        _season_or_404(db, season_id)
        rows = db.fetchall(
            """
            SELECT
                b.ban_id,
                b.player_username,
                pc.name          AS pokemon_name,
                pc.types         AS pokemon_types,
                pc.sprite_url,
                pc.national_dex,
                b.banned_at,
                b.is_active,
                b.revoked_at
            FROM tournament.bans b
            JOIN tournament.pokemon_cache pc ON pc.pokemon_id = b.pokemon_id
            WHERE b.season_id = %s
            ORDER BY b.banned_at ASC
            """,
            (season_id,),
        )
    return [
        {
            "ban_id":          r["ban_id"],
            "player_username": r["player_username"],
            "pokemon_name":    r["pokemon_name"],
            "pokemon_types":   r["pokemon_types"],
            "sprite_url":      r["sprite_url"],
            "national_dex":    r["national_dex"],
            "banned_at":       r["banned_at"].isoformat() if r["banned_at"] else None,
            "is_active":       r["is_active"],
            "revoked_at":      r["revoked_at"].isoformat() if r["revoked_at"] else None,
        }
        for r in rows
    ]


@router.post("/{season_id}/bans", dependencies=[Depends(require_admin)], status_code=201)
def add_season_ban(season_id: int, body: AddBanRequest):
    """
    Registra un ban oficial para la temporada indicada.
    - El pokémon debe existir en tournament.pokemon_cache.
    - No puede repetirse un pokémon ya baneado en temporadas anteriores (is_active=TRUE).
    """
    player = body.player_username.strip().lower()
    if not player:
        raise HTTPException(status_code=422, detail="El username no puede estar vacío.")

    with get_db() as db:
        _season_or_404(db, season_id)

        # Buscar pokémon en cache (case-insensitive)
        pokemon = db.fetchone(
            "SELECT pokemon_id, name, types, sprite_url, national_dex FROM tournament.pokemon_cache WHERE LOWER(name) = LOWER(%s)",
            (body.pokemon_name.strip(),),
        )
        if pokemon is None:
            raise HTTPException(
                status_code=404,
                detail=f"'{body.pokemon_name}' no está en el cache. Solo se pueden banear pokémon que hayan recibido votos.",
            )

        # Verificar que el pokémon no esté baneado en NINGUNA otra temporada activa
        prev = db.fetchone(
            """
            SELECT s.season_name FROM tournament.bans b
            JOIN tournament.seasons s ON s.season_id = b.season_id
            WHERE b.pokemon_id = %s AND b.season_id != %s AND b.is_active = TRUE
            """,
            (pokemon["pokemon_id"], season_id),
        )
        if prev:
            raise HTTPException(
                status_code=409,
                detail=f"'{pokemon['name']}' ya está baneado en '{prev['season_name']}'. No se puede repetir un ban de otra temporada.",
            )

        # Verificar que el jugador no tenga ya un ban activo en esta temporada
        if db.fetchone(
            "SELECT 1 FROM tournament.bans WHERE player_username = %s AND season_id = %s AND is_active = TRUE",
            (player, season_id),
        ):
            raise HTTPException(status_code=409, detail=f"'{player}' ya tiene un ban activo en esta temporada.")

        # Verificar que el pokémon no esté ya baneado en esta temporada
        existing = db.fetchone(
            "SELECT player_username FROM tournament.bans WHERE pokemon_id = %s AND season_id = %s AND is_active = TRUE",
            (pokemon["pokemon_id"], season_id),
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"'{pokemon['name']}' ya está baneado por '{existing['player_username']}' en esta temporada.",
            )

        db.execute(
            "INSERT INTO tournament.bans (season_id, player_username, pokemon_id) VALUES (%s, %s, %s)",
            (season_id, player, pokemon["pokemon_id"]),
        )
        row = db.fetchone(
            "SELECT ban_id, banned_at FROM tournament.bans WHERE player_username = %s AND season_id = %s AND is_active = TRUE",
            (player, season_id),
        )

    return {
        "ban_id":          row["ban_id"],
        "player_username": player,
        "pokemon_name":    pokemon["name"],
        "pokemon_types":   pokemon["types"],
        "sprite_url":      pokemon["sprite_url"],
        "national_dex":    pokemon["national_dex"],
        "banned_at":       row["banned_at"].isoformat() if row["banned_at"] else None,
        "is_active":       True,
        "revoked_at":      None,
    }


@router.delete("/{season_id}/bans/{ban_id}", dependencies=[Depends(require_admin)])
def revoke_season_ban(season_id: int, ban_id: int):
    """Revoca un ban oficial. Marca is_active=False y registra revoked_at."""
    with get_db() as db:
        _season_or_404(db, season_id)

        ban = db.fetchone(
            "SELECT 1 FROM tournament.bans WHERE ban_id = %s AND season_id = %s AND is_active = TRUE",
            (ban_id, season_id),
        )
        if ban is None:
            raise HTTPException(status_code=404, detail="Ban no encontrado o ya revocado.")

        db.execute(
            "UPDATE tournament.bans SET is_active = FALSE, revoked_at = NOW() WHERE ban_id = %s",
            (ban_id,),
        )

    return {"ok": True}


# ── Season Violations ────────────────────────────────────────────────────────

@router.get("/{season_id}/violations", dependencies=[Depends(require_admin)])
def get_season_violations(season_id: int):
    """
    Violaciones de ban detectadas en la temporada: jugadores que usaron o
    llevaron en banca un pokémon que tienen baneado.
    """
    with get_db() as db:
        _season_or_404(db, season_id)
        rows = db.fetchall(
            """
            SELECT
                v.violation_id,
                v.battle_id,
                dpl.username          AS player_username,
                dp.species            AS pokemon_species,
                pc.sprite_url,
                v.was_active,
                fb.battle_date,
                v.detected_at
            FROM battle.fact_ban_violations v
            JOIN battle.fact_battles      fb  ON fb.battle_id  = v.battle_id
            JOIN battle.dim_players       dpl ON dpl.player_id = v.player_id
            JOIN battle.dim_pokemon       dp  ON dp.pokemon_id = v.pokemon_id
            JOIN tournament.bans          b   ON b.ban_id      = v.ban_id
            JOIN tournament.pokemon_cache pc  ON pc.pokemon_id = b.pokemon_id
            WHERE v.season_id = %s
            ORDER BY v.detected_at DESC
            """,
            (season_id,),
        )
    return [
        {
            "violation_id":    r["violation_id"],
            "battle_id":       r["battle_id"],
            "player_username": r["player_username"],
            "pokemon_species": r["pokemon_species"],
            "sprite_url":      r["sprite_url"],
            "was_active":      r["was_active"],
            "battle_date":     r["battle_date"].isoformat() if r["battle_date"] else None,
            "detected_at":     r["detected_at"].isoformat() if r["detected_at"] else None,
        }
        for r in rows
    ]


# ── Season Votes (ranking) ────────────────────────────────────────────────────

@router.get("/{season_id}/votes", dependencies=[Depends(require_admin)])
def get_season_votes(season_id: int):
    """Ranking de votos anónimos de la temporada."""
    with get_db() as db:
        _season_or_404(db, season_id)
        rows = db.fetchall(
            "SELECT * FROM tournament.v_ban_ranking WHERE season_id = %s ORDER BY ranking ASC",
            (season_id,),
        )
    return rows


# ── Season Whitelist ──────────────────────────────────────────────────────────

class AddWhitelistRequest(BaseModel):
    username: str


@router.get("/{season_id}/whitelist", dependencies=[Depends(require_admin)])
def get_season_whitelist(season_id: int):
    """Whitelist de jugadores habilitados para votar en la temporada."""
    with get_db() as db:
        _season_or_404(db, season_id)
        rows = db.fetchall(
            "SELECT voter_hash, username, added_at FROM tournament.ban_whitelist WHERE season_id = %s ORDER BY added_at",
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


@router.post("/{season_id}/whitelist", dependencies=[Depends(require_admin)], status_code=201)
def add_season_whitelist(season_id: int, body: AddWhitelistRequest):
    """Agrega un jugador al whitelist de la temporada."""
    from ..crypto import hash_username

    username = body.username.strip().lower()
    if not username:
        raise HTTPException(status_code=422, detail="Username vacío.")

    voter_hash = hash_username(username)

    with get_db() as db:
        _season_or_404(db, season_id)

        if db.fetchone(
            "SELECT 1 FROM tournament.ban_whitelist WHERE voter_hash = %s AND season_id = %s",
            (voter_hash, season_id),
        ):
            raise HTTPException(status_code=409, detail=f"'{username}' ya está en el whitelist de esta temporada.")

        db.execute(
            "INSERT INTO tournament.ban_whitelist (voter_hash, season_id, username) VALUES (%s, %s, %s)",
            (voter_hash, season_id, username),
        )

    return {"ok": True, "username": username, "voter_hash": voter_hash}


@router.delete("/{season_id}/whitelist/{voter_hash}", dependencies=[Depends(require_admin)])
def remove_season_whitelist(season_id: int, voter_hash: str):
    """Elimina un jugador del whitelist (solo si no ha votado)."""
    with get_db() as db:
        _season_or_404(db, season_id)

        if db.fetchone(
            "SELECT 1 FROM tournament.ban_participation WHERE voter_hash = %s AND season_id = %s",
            (voter_hash, season_id),
        ):
            raise HTTPException(status_code=409, detail="Este jugador ya votó — no se puede eliminar.")

        db.execute(
            "DELETE FROM tournament.ban_whitelist WHERE voter_hash = %s AND season_id = %s",
            (voter_hash, season_id),
        )

    return {"ok": True}
