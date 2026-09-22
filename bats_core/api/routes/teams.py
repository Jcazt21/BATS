"""
BATS — Registro y gestión de equipos por temporada.

Endpoints (la identidad sale de la sesión; ya no viaja en la URL):
  GET    /api/teams/active-season          → info de la temporada activa (público)
  GET    /api/teams/me                     → mi roster
  GET    /api/teams/me/banned              → pokémon que no puedo llevar
  POST   /api/teams/me                     → registro del equipo inicial
  POST   /api/teams/me/pokemon             → agrega pokémon a mi roster
  PATCH  /api/teams/me/pokemon/{id}        → edita un set sin consumir rotaciones
  POST   /api/teams/me/swap                → reemplaza un pokémon por otro en una sola transacción
  DELETE /api/teams/me/pokemon/{id}        → quita un pokémon de mi roster
  POST   /api/teams/me/validate            → checklist en vivo contra las reglas activas
  GET    /api/teams/me/history             → historial de rotaciones (lo escribe el ETL)
  GET    /api/teams/rosters                → sets canónicos privados para Showdown
  GET    /api/teams/{username}             → roster ajeno: solo si el registro está cerrado o el equipo bloqueado (o eres admin)
"""
import json

from fastapi import APIRouter, Depends, HTTPException

from ...dex import DexNotLoaded, resolve_entries
from ...rules import check_team, normalize_restrictions, rule_checklist
from ...teamset import canonical_set, to_id, to_paste
from ..auth import require_player, service_token
from ..common import get_active_season as _get_active_season, iso, upsert_pokemon
from ..db import get_db
from ..schemas import AddPokemonRequest, EditSetRequest, PokemonEntry, RegisterRequest, SwapRequest, ValidateRequest

router = APIRouter(prefix="/api/teams", tags=["teams"])
require_ingest_token = service_token("BATS_INGEST_TOKEN")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve(db, pokemon: list[PokemonEntry]) -> list[dict]:
    """
    Metadatos reales de cada pokémon (tournament.dex_species). Lo que el cliente declare
    de tipos, color, generación o egg groups se ignora: si no, cualquiera podría
    declarar "amarillo" y saltarse las restricciones de la temporada.
    """
    try:
        entries, unknown = resolve_entries(db, pokemon)
    except DexNotLoaded:
        raise HTTPException(status_code=503, detail="dex_not_loaded")
    if unknown:
        raise HTTPException(status_code=422, detail=f"unknown_species:{','.join(unknown)}")
    return entries


def _upsert_pokemon(db, entry: dict) -> int:
    """Upsert en pokemon_cache con los datos del dex (`entry` sale de _resolve)."""
    return upsert_pokemon(
        db, entry["name"], entry["national_dex"], entry["types"], entry.get("sprite_url"),
        entry["color"], entry["generation"],
    )


def _ensure_open(season: dict) -> None:
    """409 si el admin cerró el registro de la temporada (restricción registration_closed)."""
    if normalize_restrictions(season["restrictions"])["registration_closed"]:
        raise HTTPException(status_code=409, detail="registration_closed")


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


def _insert_roster_pokemon(db, roster_id: int, pokemon_id: int, entry: dict) -> None:
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
            entry.get("held_item"),
            entry.get("ability"),
            entry.get("nature"),
            entry.get("tera_type"),
            json.dumps(entry.get("moves") or []),
            json.dumps(entry.get("evs") or {}),
            json.dumps(entry.get("ivs") or {}),
        ),
    )
    _mark_validation_pending(db, roster_id)


def _mark_validation_pending(db, roster_id: int) -> None:
    """Un cambio de roster invalida el último veredicto recibido de Showdown."""
    db.execute(
        """
        UPDATE tournament.roster
        SET validation_errors = NULL, validated_at = NULL,
            validated_commit = NULL, updated_at = NOW()
        WHERE roster_id = %s
        """,
        (roster_id,),
    )


def _pool_entries(db, roster_id: int, replace: dict[int, PokemonEntry] | None = None) -> list[dict]:
    """Carga los sets del pool y permite sustituir slots antes de validar el conjunto."""
    rows = db.fetchall(
        """
        SELECT pc.pokemon_id, pc.name, rp.held_item, rp.ability, rp.nature,
               rp.tera_type, rp.moves, rp.evs, rp.ivs
        FROM tournament.roster_pokemon rp
        JOIN tournament.pokemon_cache pc ON pc.pokemon_id = rp.pokemon_id
        WHERE rp.roster_id = %s
        ORDER BY rp.added_at, rp.roster_pokemon_id
        """,
        (roster_id,),
    )
    replacements = replace or {}
    entries = []
    for row in rows:
        replacement = replacements.get(row["pokemon_id"])
        if replacement is not None:
            entries.append(replacement.model_dump())
        else:
            entries.append({
                "name": row["name"], "held_item": row["held_item"],
                "ability": row["ability"], "nature": row["nature"],
                "tera_type": row["tera_type"], "moves": row["moves"] or [],
                "evs": row["evs"] or {}, "ivs": row["ivs"] or {},
            })
    return entries


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
        "type_of_month":    season["type_of_month"],
        "max_team_size":    season["max_team_size"],
        "max_team_changes": season["max_team_changes"],
        "restrictions":     season["restrictions"],
    }


@router.get("/me/banned")
def get_player_bans(player: dict = Depends(require_player)):
    """
    Retorna todos los pokémon no permitidos para el jugador:
    - Con al menos un voto en ban_votes (global)
    - O con ban oficial en tournament.bans para este jugador
    """
    username = player["username"].lower()
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


def _load_roster(username: str, viewer: dict, own: bool):
    """Roster completo del jugador para la temporada activa."""
    username = username.lower().strip()
    with get_db() as db:
        season = _get_active_season(db)
        _check_whitelist(db, username, season["season_id"])

        row = db.fetchone(
            """
            SELECT roster_id, changes_used, is_locked, registered_at,
                   validation_errors, validated_at, validated_commit
            FROM tournament.roster
            WHERE season_id = %s AND LOWER(username) = %s
            """,
            (season["season_id"], username),
        )
        if not row:
            raise HTTPException(status_code=404, detail="No hay equipo registrado para esta temporada.")
        published = row["is_locked"] or normalize_restrictions(season["restrictions"])["registration_closed"]
        if not own and not published and not viewer["is_admin"]:
            raise HTTPException(status_code=403, detail="El equipo aún no es público.")

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
            "added_at":   iso(p["added_at"]),
            "in_lineup":  p["pokemon_id"] in lineup_ids,
        }

    validation_errors = row["validation_errors"] if isinstance(row["validation_errors"], list) else []
    validation = {
        "state": "pending" if row["validated_at"] is None else ("errors" if validation_errors else "ok"),
        "errors": validation_errors,
        "checked_at": iso(row["validated_at"]),
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
        "registered_at":     iso(row["registered_at"]),
        "lineup_set":        len(lineup_ids) > 0,
        "validation":        validation,
        "pool": [_fmt(p) for p in pool_rows],
    }


@router.get("/me")
def get_my_roster(player: dict = Depends(require_player)):
    return _load_roster(player["username"], player, own=True)


@router.patch("/me/pokemon/{pokemon_id}")
def edit_set(
    pokemon_id: int,
    body: EditSetRequest,
    player: dict = Depends(require_player),
):
    """
    Cambia los detalles de un set sin consumir rotaciones. La especie permanece
    congelada; para sustituirla se usa ``/me/swap``.
    """
    username = player["username"].lower()
    with get_db() as db:
        season = _get_active_season(db)
        _ensure_open(season)
        _check_whitelist(db, username, season["season_id"])
        roster = db.fetchone(
            """SELECT roster_id, is_locked FROM tournament.roster
               WHERE season_id = %s AND LOWER(username) = %s""",
            (season["season_id"], username),
        )
        if not roster:
            raise HTTPException(status_code=404, detail="No hay equipo registrado.")
        if roster["is_locked"]:
            raise HTTPException(status_code=409, detail="roster_locked")

        current = db.fetchone(
            """SELECT pc.name
               FROM tournament.roster_pokemon rp
               JOIN tournament.pokemon_cache pc ON pc.pokemon_id = rp.pokemon_id
               WHERE rp.roster_id = %s AND rp.pokemon_id = %s""",
            (roster["roster_id"], pokemon_id),
        )
        if not current:
            raise HTTPException(status_code=404, detail="El pokémon no está en el equipo.")
        if to_id(body.name) != to_id(current["name"]):
            raise HTTPException(status_code=422, detail="species_mismatch")

        pool = _pool_entries(db, roster["roster_id"], replace={pokemon_id: body})
        entries = _resolve(db, pool)
        violations = check_team(entries, season["restrictions"])
        if violations:
            raise HTTPException(status_code=422, detail=violations[0]["code"])

        edited = next(entry for entry in entries if to_id(entry["name"]) == to_id(current["name"]))
        _insert_roster_pokemon(db, roster["roster_id"], pokemon_id, edited)
    return {"ok": True, "pokemon_id": pokemon_id}


@router.delete("/me/pokemon/{pokemon_id}")
def remove_pokemon(pokemon_id: int, player: dict = Depends(require_player)):
    """Elimina un pokémon de mi roster."""
    username = player["username"].lower()
    with get_db() as db:
        season = _get_active_season(db)
        _ensure_open(season)
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
        _mark_validation_pending(db, roster_id)

    return {"ok": True}


@router.post("/me/pokemon")
def add_pokemon(body: AddPokemonRequest, player: dict = Depends(require_player)):
    """Agrega pokémon a mi roster existente, si no está lleno."""
    username = player["username"].lower()
    if not body.pokemon:
        raise HTTPException(status_code=422, detail="La lista de pokémon no puede estar vacía.")

    with get_db() as db:
        season = _get_active_season(db)
        _ensure_open(season)
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

        entries = _resolve(db, body.pokemon)

        # Check bans
        banned = _get_active_bans(db, season["season_id"], username)
        if banned:
            violations = [e["name"] for e in entries if e["name"].lower() in banned]
            if violations:
                raise HTTPException(status_code=422, detail=f"banned:{','.join(violations)}")

        for entry in entries:
            pokemon_id = _upsert_pokemon(db, entry)
            _insert_roster_pokemon(db, roster_id, pokemon_id, entry)

    return {"ok": True, "added": len(body.pokemon)}


@router.post("/me")
def register_team(body: RegisterRequest, player: dict = Depends(require_player)):
    """Registra mi equipo inicial para la temporada activa."""
    username = player["username"].lower()

    with get_db() as db:
        season = _get_active_season(db)
        _ensure_open(season)
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

        entries = _resolve(db, body.pokemon)

        # Validate no banned pokémon are in the team
        banned = _get_active_bans(db, season["season_id"], username)
        if banned:
            violations = [e["name"] for e in entries if e["name"].lower() in banned]
            if violations:
                raise HTTPException(
                    status_code=422,
                    detail=f"banned:{','.join(violations)}",
                )

        # Restricciones de la temporada (bats_core/rules.py). Se rechaza con la primera
        # violación, con el mismo código de detalle que ya interpreta el frontend.
        violations = check_team(entries, season["restrictions"])
        if violations:
            raise HTTPException(status_code=422, detail=violations[0]["code"])

        roster_row = db.fetchone(
            "INSERT INTO tournament.roster (season_id, username) VALUES (%s, %s) RETURNING roster_id",
            (season["season_id"], username),
        )
        roster_id = roster_row["roster_id"]

        for entry in entries:
            pokemon_id = _upsert_pokemon(db, entry)
            _insert_roster_pokemon(db, roster_id, pokemon_id, entry)

    return {
        "roster_id":     roster_id,
        "username":      username,
        "season_id":     season["season_id"],
        "pokemon_count": len(body.pokemon),
    }


@router.post("/me/swap")
def swap_pokemon(body: SwapRequest, player: dict = Depends(require_player)):
    """
    Reemplaza un pokémon del roster por otro. Es UNA transacción: si el nuevo está
    baneado o ya está en el equipo no se quita nada (antes eran dos llamadas y
    un fallo intermedio dejaba el equipo incompleto).
    """
    username = player["username"].lower()
    with get_db() as db:
        season = _get_active_season(db)
        _ensure_open(season)
        _check_whitelist(db, username, season["season_id"])
        row = db.fetchone(
            "SELECT roster_id FROM tournament.roster WHERE season_id = %s AND LOWER(username) = %s",
            (season["season_id"], username),
        )
        if not row:
            raise HTTPException(status_code=404, detail="No hay equipo registrado.")
        roster_id = row["roster_id"]

        if not db.fetchone(
            "SELECT 1 FROM tournament.roster_pokemon WHERE roster_id = %s AND pokemon_id = %s",
            (roster_id, body.remove_pokemon_id),
        ):
            raise HTTPException(status_code=404, detail="El pokémon no está en el equipo.")

        new_entry = _resolve(db, [body.add])[0]
        if new_entry["name"].lower() in _get_active_bans(db, season["season_id"], username):
            raise HTTPException(status_code=422, detail=f"banned:{new_entry['name']}")

        new_id = _upsert_pokemon(db, new_entry)
        if new_id != body.remove_pokemon_id and db.fetchone(
            "SELECT 1 FROM tournament.roster_pokemon WHERE roster_id = %s AND pokemon_id = %s",
            (roster_id, new_id),
        ):
            raise HTTPException(status_code=409, detail="Ese pokémon ya está en tu equipo.")

        db.execute("DELETE FROM tournament.roster_lineup WHERE roster_id = %s AND pokemon_id = %s",
                   (roster_id, body.remove_pokemon_id))
        db.execute("DELETE FROM tournament.roster_pokemon WHERE roster_id = %s AND pokemon_id = %s",
                   (roster_id, body.remove_pokemon_id))
        _insert_roster_pokemon(db, roster_id, new_id, new_entry)
    return {"ok": True, "pokemon_id": new_id}


@router.post("/me/validate")
def validate_my_team(body: ValidateRequest, player: dict = Depends(require_player)):
    """
    Checklist en vivo: cada regla aplicable con su estado (cumple / no cumple), sin
    guardar nada. Es la misma validación (bats_core/rules.py) que hace el registro.
    """
    username = player["username"].lower()
    with get_db() as db:
        season = _get_active_season(db)
        banned = _get_active_bans(db, season["season_id"], username)
        entries = _resolve(db, body.pokemon)
    checklist = rule_checklist(
        entries, season["restrictions"],
        type_of_month=season["type_of_month"],
        max_team_size=season["max_team_size"],
        banned_names=banned,
        lineup=body.lineup,
    )
    return {"ok": all(row["ok"] for row in checklist), "checklist": checklist}


@router.get("/me/history")
def my_rotation_history(player: dict = Depends(require_player)):
    """Rotaciones de mi lineup detectadas por el ETL (más reciente primero)."""
    username = player["username"].lower()
    with get_db() as db:
        season = _get_active_season(db)
        rows = db.fetchall(
            """
            SELECT cl.change_number, cl.changed_at, cl.changed_by, cl.note AS battle_id,
                   rem.name AS removed, add_.name AS added
            FROM tournament.roster_change_log cl
            JOIN tournament.roster r ON r.roster_id = cl.roster_id
            LEFT JOIN tournament.pokemon_cache rem  ON rem.pokemon_id  = cl.removed_pokemon_id
            LEFT JOIN tournament.pokemon_cache add_ ON add_.pokemon_id = cl.added_pokemon_id
            WHERE r.season_id = %s AND LOWER(r.username) = %s
            ORDER BY cl.change_number DESC, cl.change_id
            """,
            (season["season_id"], username),
        )
    by_change: dict[int, dict] = {}
    for r in rows:
        c = by_change.setdefault(r["change_number"], {
            "change_number": r["change_number"], "changed_at": iso(r["changed_at"]),
            "battle_id": r["battle_id"], "removed": [], "added": [],
        })
        if r["removed"]:
            c["removed"].append(r["removed"])
        if r["added"]:
            c["added"].append(r["added"])
    return {"max_rotations": season["max_team_changes"], "rotations": list(by_change.values())}


@router.get("/rosters")
def rosters_for_showdown(_: None = Depends(require_ingest_token)):
    """Publica los sets de la temporada activa exclusivamente para el plugin de PS."""
    with get_db() as db:
        season = _get_active_season(db)
        rows = db.fetchall(
            """
            SELECT LOWER(r.username) AS username, pc.name, ds.types,
                   rp.held_item, rp.ability, rp.nature, rp.tera_type,
                   rp.moves, rp.evs, rp.ivs
            FROM tournament.roster r
            JOIN tournament.roster_pokemon rp ON rp.roster_id = r.roster_id
            JOIN tournament.pokemon_cache pc ON pc.pokemon_id = rp.pokemon_id
            LEFT JOIN tournament.dex_species ds ON LOWER(ds.name) = LOWER(pc.name)
            WHERE r.season_id = %s
            ORDER BY LOWER(r.username), rp.added_at, rp.roster_pokemon_id
            """,
            (season["season_id"],),
        )

    rosters: dict[str, dict] = {}
    for row in rows:
        entry = {
            "name": row["name"], "held_item": row["held_item"],
            "ability": row["ability"], "nature": row["nature"],
            "tera_type": row["tera_type"], "moves": row["moves"] or [],
            "evs": row["evs"] or {}, "ivs": row["ivs"] or {},
        }
        primary_type = (row["types"] or "").split("/")[0].strip() or None
        bucket = rosters.setdefault(row["username"], {"sets": [], "paste": []})
        bucket["sets"].append(canonical_set(entry, primary_type))
        bucket["paste"].append(to_paste(entry))

    return {
        "season_id": season["season_id"],
        "enforcement": normalize_restrictions(season["restrictions"])["roster_enforcement"],
        "rosters": {
            username: {"sets": data["sets"], "paste": "\n\n".join(data["paste"])}
            for username, data in rosters.items()
        },
    }


@router.get("/{username}")
def get_roster(username: str, player: dict = Depends(require_player)):
    """Roster de otro jugador. Declarada al final: /{username} captura cualquier ruta anterior."""
    return _load_roster(username, player, own=username.lower().strip() == player["username"].lower())
