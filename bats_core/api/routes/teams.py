"""
BATS — Registro y gestión de equipos por temporada (rutas públicas).

Endpoints:
  GET   /api/teams/active-season          → info de la temporada activa (límites)
  GET   /api/teams/{username}             → roster del jugador en la temporada activa
  POST  /api/teams/register               → registra el equipo inicial de un jugador
  PATCH /api/teams/swap                   → realiza un cambio de pokémon en el equipo
"""
import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db import get_db

router = APIRouter(prefix="/api/teams", tags=["teams"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PokemonEntry(BaseModel):
    name:         str
    national_dex: Optional[int]        = None
    types:        Optional[str]        = None
    sprite_url:   Optional[str]        = None
    held_item:    Optional[str]        = None
    ability:      Optional[str]        = None
    nature:       Optional[str]        = None
    tera_type:    Optional[str]        = None
    moves:        list[str]            = []
    evs:          dict[str, int]       = {}
    ivs:          dict[str, int]       = {}
    color:        Optional[str]        = None
    generation:   Optional[int]        = None
    egg_groups:   list[str]            = []


class RegisterRequest(BaseModel):
    username: str
    pokemon:  list[PokemonEntry]


class SwapRequest(BaseModel):
    username:       str
    remove_pokemon: str        # name of the pokemon to remove
    add_pokemon:    PokemonEntry


# ── Helpers ───────────────────────────────────────────────────────────────────

def _upsert_pokemon(db, entry: PokemonEntry) -> int:
    """Upsertea en pokemon_cache y retorna el pokemon_id."""
    row = db.fetchone(
        "SELECT tournament.upsert_pokemon_cache(%s, %s, %s, %s, %s, %s::smallint) AS pokemon_id",
        (entry.name, entry.national_dex, entry.types, entry.sprite_url, entry.color, entry.generation),
    )
    return int(row["pokemon_id"])


def _get_active_season(db) -> dict:
    row = db.fetchone(
        """
        SELECT season_id, season_name, max_team_size, max_team_changes, restrictions
        FROM tournament.seasons
        WHERE is_active = TRUE
        LIMIT 1
        """
    )
    if not row:
        raise HTTPException(status_code=404, detail="No hay temporada activa.")
    result = dict(row)
    # psycopg2 may return JSONB as str; parse if needed
    if isinstance(result.get("restrictions"), str):
        result["restrictions"] = json.loads(result["restrictions"])
    result["restrictions"] = result.get("restrictions") or {}
    return result


def _check_whitelist(db, username: str, season_id: int) -> None:
    """Lanza 403 si el jugador no está en el whitelist de la temporada activa."""
    row = db.fetchone(
        """
        SELECT 1 FROM tournament.ban_whitelist
        WHERE season_id = %s AND LOWER(username) = %s
        LIMIT 1
        """,
        (season_id, username.lower()),
    )
    if not row:
        raise HTTPException(status_code=403, detail="not_in_whitelist")


def _insert_roster_pokemon(db, roster_id: int, pokemon_id: int, entry: PokemonEntry) -> None:
    """Inserta o reemplaza un slot de roster_pokemon con datos completos de Showdown."""
    db.execute(
        """
        INSERT INTO tournament.roster_pokemon
            (roster_id, pokemon_id, held_item, ability, nature, tera_type, moves, evs, ivs)
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
        ON CONFLICT (roster_id, pokemon_id) DO UPDATE SET
            held_item = EXCLUDED.held_item,
            ability   = EXCLUDED.ability,
            nature    = EXCLUDED.nature,
            tera_type = EXCLUDED.tera_type,
            moves     = EXCLUDED.moves,
            evs       = EXCLUDED.evs,
            ivs       = EXCLUDED.ivs
        """,
        (
            roster_id,
            pokemon_id,
            entry.held_item,
            entry.ability,
            entry.nature,
            entry.tera_type,
            json.dumps(entry.moves),
            json.dumps(entry.evs),
            json.dumps(entry.ivs),
        ),
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_active_bans(db, season_id: int, username: str | None = None) -> set[str]:
    """
    Retorna el set de nombres (lowercase) de pokémon no permitidos:
    - Pokémon con al menos un voto en ban_votes para la temporada (global)
    - Bans oficiales per-jugador en tournament.bans (si se pasa username)
    """
    rows = db.fetchall(
        """
        SELECT LOWER(pc.name) AS name
        FROM tournament.pokemon_cache pc
        WHERE pc.pokemon_id IN (
            SELECT bv.pokemon_id
            FROM tournament.ban_votes bv
            WHERE bv.season_id = %s
            UNION
            SELECT b.pokemon_id
            FROM tournament.bans b
            WHERE b.season_id = %s AND b.is_active = TRUE
              AND (%s IS NULL OR LOWER(b.player_username) = %s)
        )
        """,
        (season_id, season_id, username, username),
    )
    return {r["name"] for r in rows}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/active-season")
def get_active_season():
    """Retorna la configuración pública de la temporada activa."""
    with get_db() as db:
        season = _get_active_season(db)
    return {
        "season_id":        season["season_id"],
        "season_name":      season["season_name"],
        "max_team_size":    season["max_team_size"],
        "max_team_changes": season["max_team_changes"],
        "restrictions":     season["restrictions"],
    }


@router.get("/banned/{username}")
def get_player_bans(username: str):
    """
    Retorna todos los pokémon no permitidos para el jugador:
    - Con al menos un voto en ban_votes (global)
    - O con ban oficial en tournament.bans para este jugador
    """
    username = username.lower().strip()
    with get_db() as db:
        season = _get_active_season(db)
        rows = db.fetchall(
            """
            SELECT DISTINCT pc.pokemon_id, pc.name, pc.types, pc.sprite_url
            FROM tournament.pokemon_cache pc
            WHERE pc.pokemon_id IN (
                SELECT bv.pokemon_id FROM tournament.ban_votes bv
                WHERE bv.season_id = %s
                UNION
                SELECT b.pokemon_id FROM tournament.bans b
                WHERE b.season_id = %s AND b.is_active = TRUE
                  AND LOWER(b.player_username) = %s
            )
            ORDER BY pc.name
            """,
            (season["season_id"], season["season_id"], username),
        )
    return [
        {"pokemon_id": r["pokemon_id"], "name": r["name"], "types": r["types"], "sprite_url": r["sprite_url"]}
        for r in rows
    ]


@router.get("/{username}")
def get_roster(username: str):
    """Retorna el roster completo del jugador para la temporada activa."""
    username = username.lower().strip()
    with get_db() as db:
        season = _get_active_season(db)
        _check_whitelist(db, username, season["season_id"])

        row = db.fetchone(
            """
            SELECT roster_id, changes_used, is_locked, registered_at
            FROM tournament.roster
            WHERE season_id = %s AND LOWER(username) = %s
            """,
            (season["season_id"], username),
        )
        if not row:
            raise HTTPException(status_code=404, detail="No hay equipo registrado para esta temporada.")

        pool_rows = db.fetchall(
            """
            SELECT
                pc.pokemon_id, pc.name, pc.types, pc.sprite_url,
                rp.held_item, rp.ability, rp.nature, rp.tera_type,
                rp.moves, rp.evs, rp.ivs, rp.added_at
            FROM tournament.roster_pokemon rp
            JOIN tournament.pokemon_cache pc ON pc.pokemon_id = rp.pokemon_id
            WHERE rp.roster_id = %s
            ORDER BY rp.added_at ASC
            """,
            (row["roster_id"],),
        )

        lineup_ids = {
            r["pokemon_id"]
            for r in db.fetchall(
                "SELECT pokemon_id FROM tournament.roster_lineup WHERE roster_id = %s",
                (row["roster_id"],),
            )
        }

    def _fmt(p):
        return {
            "pokemon_id": p["pokemon_id"],
            "name":       p["name"],
            "types":      p["types"],
            "sprite_url": p["sprite_url"],
            "held_item":  p["held_item"],
            "ability":    p["ability"],
            "nature":     p["nature"],
            "tera_type":  p["tera_type"],
            "moves":      p["moves"] if isinstance(p["moves"], list) else [],
            "evs":        p["evs"]   if isinstance(p["evs"],   dict) else {},
            "ivs":        p["ivs"]   if isinstance(p["ivs"],   dict) else {},
            "added_at":   p["added_at"].isoformat() if p["added_at"] else None,
            "in_lineup":  p["pokemon_id"] in lineup_ids,
        }

    return {
        "username":          username,
        "season_id":         season["season_id"],
        "season_name":       season["season_name"],
        "rotations_used":    row["changes_used"],
        "rotations_remaining": season["max_team_changes"] - row["changes_used"],
        "max_team_size":     season["max_team_size"],
        "max_rotations":     season["max_team_changes"],
        "is_locked":         row["is_locked"],
        "registered_at":     row["registered_at"].isoformat() if row["registered_at"] else None,
        "lineup_set":        len(lineup_ids) > 0,
        "pool": [_fmt(p) for p in pool_rows],
    }


@router.delete("/{username}/pokemon/{pokemon_id}")
def remove_pokemon(username: str, pokemon_id: int):
    """Elimina un pokémon del roster del jugador."""
    username = username.lower().strip()
    with get_db() as db:
        season = _get_active_season(db)
        _check_whitelist(db, username, season["season_id"])

        row = db.fetchone(
            "SELECT roster_id FROM tournament.roster WHERE season_id = %s AND LOWER(username) = %s",
            (season["season_id"], username),
        )
        if not row:
            raise HTTPException(status_code=404, detail="No hay equipo registrado.")

        roster_id = row["roster_id"]

        existing = db.fetchone(
            "SELECT 1 FROM tournament.roster_pokemon WHERE roster_id = %s AND pokemon_id = %s",
            (roster_id, pokemon_id),
        )
        if not existing:
            raise HTTPException(status_code=404, detail="El pokémon no está en el equipo.")

        # Remove from lineup first (no cascade from roster_pokemon)
        db.execute(
            "DELETE FROM tournament.roster_lineup WHERE roster_id = %s AND pokemon_id = %s",
            (roster_id, pokemon_id),
        )
        db.execute(
            "DELETE FROM tournament.roster_pokemon WHERE roster_id = %s AND pokemon_id = %s",
            (roster_id, pokemon_id),
        )

    return {"ok": True}


class AddPokemonRequest(BaseModel):
    pokemon: list[PokemonEntry]


@router.post("/{username}/pokemon")
def add_pokemon(username: str, body: AddPokemonRequest):
    """Agrega pokémon a un roster existente que no esté lleno."""
    username = username.lower().strip()
    if not body.pokemon:
        raise HTTPException(status_code=422, detail="La lista de pokémon no puede estar vacía.")

    with get_db() as db:
        season = _get_active_season(db)
        _check_whitelist(db, username, season["season_id"])

        row = db.fetchone(
            "SELECT roster_id FROM tournament.roster WHERE season_id = %s AND LOWER(username) = %s",
            (season["season_id"], username),
        )
        if not row:
            raise HTTPException(status_code=404, detail="No hay equipo registrado.")

        roster_id = row["roster_id"]

        current = db.fetchone(
            "SELECT COUNT(*) AS cnt FROM tournament.roster_pokemon WHERE roster_id = %s",
            (roster_id,),
        )
        current_count = int(current["cnt"])
        new_total = current_count + len(body.pokemon)
        if new_total > season["max_team_size"]:
            raise HTTPException(
                status_code=422,
                detail=f"El equipo quedaría con {new_total} pokémon (máximo {season['max_team_size']}).",
            )

        # Check bans
        banned = _get_active_bans(db, season["season_id"], username)
        if banned:
            violations = [p.name for p in body.pokemon if p.name.lower() in banned]
            if violations:
                raise HTTPException(status_code=422, detail=f"banned:{','.join(violations)}")

        for entry in body.pokemon:
            pokemon_id = _upsert_pokemon(db, entry)
            _insert_roster_pokemon(db, roster_id, pokemon_id, entry)

    return {"ok": True, "added": len(body.pokemon)}


@router.post("/register")
def register_team(body: RegisterRequest):
    """Registra el equipo inicial de un jugador para la temporada activa."""
    username = body.username.lower().strip()
    if not username:
        raise HTTPException(status_code=422, detail="Username no puede estar vacío.")

    with get_db() as db:
        season = _get_active_season(db)
        _check_whitelist(db, username, season["season_id"])

        if len(body.pokemon) == 0:
            raise HTTPException(status_code=422, detail="El equipo no puede estar vacío.")
        if len(body.pokemon) > season["max_team_size"]:
            raise HTTPException(
                status_code=422,
                detail=f"Máximo {season['max_team_size']} pokémon permitidos.",
            )

        existing = db.fetchone(
            """
            SELECT r.roster_id,
                   COUNT(rp.pokemon_id) AS pokemon_count
            FROM tournament.roster r
            LEFT JOIN tournament.roster_pokemon rp ON rp.roster_id = r.roster_id
            WHERE r.season_id = %s AND LOWER(r.username) = %s
            GROUP BY r.roster_id
            """,
            (season["season_id"], username),
        )
        if existing:
            if existing["pokemon_count"] > 0:
                raise HTTPException(
                    status_code=409,
                    detail="Ya existe un equipo registrado para esta temporada.",
                )
            # Roster exists but is empty — delete it and re-register
            db.execute(
                "DELETE FROM tournament.roster WHERE roster_id = %s",
                (existing["roster_id"],),
            )

        # Validate no banned pokémon are in the team
        banned = _get_active_bans(db, season["season_id"], username)
        if banned:
            violations = [p.name for p in body.pokemon if p.name.lower() in banned]
            if violations:
                raise HTTPException(
                    status_code=422,
                    detail=f"banned:{','.join(violations)}",
                )

        # ── Restriction validation ────────────────────────────────────────────
        rules = season["restrictions"]

        # Item Clause: no duplicate held items
        if rules.get("item_clause"):
            from collections import Counter
            items = [p.held_item for p in body.pokemon if p.held_item]
            dupes = [item for item, count in Counter(items).items() if count > 1]
            if dupes:
                raise HTTPException(
                    status_code=422,
                    detail=f"item_clause:{','.join(dupes)}",
                )

        # Required color: at least one pokémon must be of the required color
        req_color = rules.get("required_color")
        if req_color:
            has_one = any(p.color and p.color.lower() == req_color for p in body.pokemon)
            if not has_one:
                raise HTTPException(
                    status_code=422,
                    detail=f"missing_color:{req_color}",
                )

        # Required generation: at least one pokémon must be from the required generation
        req_gen = rules.get("required_generation")
        if req_gen:
            has_one = any(p.generation == req_gen for p in body.pokemon if p.generation)
            if not has_one:
                raise HTTPException(
                    status_code=422,
                    detail=f"missing_generation:{req_gen}",
                )

        # Required egg group: at least one pokémon must belong to the required egg group
        req_egg = rules.get("required_egg_group")
        if req_egg:
            has_one = any(req_egg in p.egg_groups for p in body.pokemon if p.egg_groups)
            if not has_one:
                raise HTTPException(
                    status_code=422,
                    detail=f"missing_egg_group:{req_egg}",
                )

        roster_row = db.fetchone(
            "INSERT INTO tournament.roster (season_id, username) VALUES (%s, %s) RETURNING roster_id",
            (season["season_id"], username),
        )
        roster_id = roster_row["roster_id"]

        for entry in body.pokemon:
            pokemon_id = _upsert_pokemon(db, entry)
            _insert_roster_pokemon(db, roster_id, pokemon_id, entry)

    return {
        "roster_id":     roster_id,
        "username":      username,
        "season_id":     season["season_id"],
        "pokemon_count": len(body.pokemon),
    }
