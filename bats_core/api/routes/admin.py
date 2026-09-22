"""
BATS — Rutas del panel de administración.

Endpoints:
  GET    /api/admin/players            → cuentas de jugador (email → username)
  POST   /api/admin/players            → da de alta una cuenta (opcionalmente ya enlazada)
  PATCH  /api/admin/players/{id}       → edita email/username/rol; enlaza o desenlaza el login
  DELETE /api/admin/players/{id}       → elimina una cuenta (no la propia, no el último admin)
  GET    /api/admin/auth-logins        → logins de Supabase Auth y si tienen cuenta en la liga
  GET    /api/admin/whitelist          → lista jugadores de la temporada activa
  POST   /api/admin/whitelist/add      → agrega jugador al whitelist de la temporada activa
  DELETE /api/admin/whitelist/{hash}   → elimina jugador del whitelist (solo si no ha votado)
  GET    /api/admin/bans               → lista de votos anónimos de la temporada activa
  GET    /api/admin/battles            → lista de batallas humanas
  DELETE /api/admin/battles/{id}       → borra una batalla
  POST   /api/admin/reset-battles      → borra toda la data de batallas
  GET    /api/admin/rosters            → equipos registrados en la temporada activa
"""
import uuid

import psycopg2
from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_admin
from ..common import get_active_season_id, iso
from ..crypto import hash_username
from ..db import get_db
from ..schemas import AddAccountRequest, AddPlayerRequest, UpdatePlayerAccountRequest

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _rename_username_cascade(db, old: str, new: str) -> dict:
    """
    Todo lo que cuelga de `username` en tournament.* sigue al nombre nuevo, en la
    MISMA transacción que ya abrió el llamador. NO toca battle.* (son hechos
    históricos con el nick que se usó en Showdown en su momento).

    tournament.ban_participation referencia a ban_whitelist por
    (voter_hash, season_id) con ON DELETE CASCADE pero SIN ON UPDATE CASCADE: no
    se puede hacer un UPDATE directo del voter_hash de ban_whitelist si hay una
    fila de participación colgando (violaría la FK). Se resuelve insertando la
    fila del hash nuevo, migrando la participación, y borrando la fila vieja.

    Los votos siguen siendo anónimos: nunca se guarda el username junto al voto,
    solo se recalcula el hash (ban_votes no se toca).
    """
    old_l, new_l = old.strip().lower(), new.strip().lower()

    # Pre-checks: si el nombre nuevo ya tiene datos en una temporada donde el
    # viejo también los tiene, abortar ANTES de escribir nada.
    if db.fetchone(
        """
        SELECT 1 FROM tournament.roster r1 JOIN tournament.roster r2 ON r2.season_id = r1.season_id
        WHERE LOWER(r1.username) = %s AND LOWER(r2.username) = %s
        """,
        (old_l, new_l),
    ):
        raise HTTPException(
            status_code=409,
            detail=f'Ya hay un equipo registrado como "{new}" en una temporada donde "{old}" también tiene equipo.',
        )
    if db.fetchone(
        """
        SELECT 1 FROM tournament.bans b1 JOIN tournament.bans b2 ON b2.season_id = b1.season_id
        WHERE LOWER(b1.player_username) = %s AND LOWER(b2.player_username) = %s
        """,
        (old_l, new_l),
    ):
        raise HTTPException(
            status_code=409,
            detail=f'Ya hay un ban registrado a nombre de "{new}" en una temporada donde "{old}" también tiene uno.',
        )

    roster_n = len(db.fetchall(
        "UPDATE tournament.roster SET username = %s WHERE LOWER(username) = %s RETURNING 1", (new_l, old_l)))
    bans_n = len(db.fetchall(
        "UPDATE tournament.bans SET player_username = %s WHERE LOWER(player_username) = %s RETURNING 1",
        (new_l, old_l)))

    old_hash, new_hash = hash_username(old), hash_username(new)
    whitelist_n = len(db.fetchall(
        """
        INSERT INTO tournament.ban_whitelist (voter_hash, season_id, username, added_at)
        SELECT %s, season_id, %s, added_at FROM tournament.ban_whitelist WHERE voter_hash = %s
        ON CONFLICT DO NOTHING RETURNING 1
        """,
        (new_hash, new_l, old_hash),
    ))
    participation_n = len(db.fetchall(
        """
        UPDATE tournament.ban_participation p1 SET voter_hash = %s
        WHERE voter_hash = %s
          AND NOT EXISTS (
              SELECT 1 FROM tournament.ban_participation p2
              WHERE p2.voter_hash = %s AND p2.season_id = p1.season_id
          )
        RETURNING 1
        """,
        (new_hash, old_hash, new_hash),
    ))
    db.execute("DELETE FROM tournament.ban_whitelist WHERE voter_hash = %s", (old_hash,))

    return {"roster": roster_n, "bans": bans_n, "whitelist": whitelist_n, "participation": participation_n}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/players")
def list_players(_: dict = Depends(require_admin)):
    with get_db() as db:
        rows = db.fetchall(
            """
            SELECT account_id, email, username, is_admin, user_id::text AS user_id,
                   user_id IS NOT NULL AS is_linked, created_at
            FROM tournament.player_accounts
            ORDER BY LOWER(username)
            """
        )
    return [{**r, "created_at": iso(r["created_at"])} for r in rows]


@router.post("/players", status_code=201)
def add_player_account(body: AddAccountRequest, _: dict = Depends(require_admin)):
    email = body.email.strip().lower()
    username = body.username.strip()
    if "@" not in email or not username:
        raise HTTPException(status_code=422, detail="Email y username son obligatorios.")
    with get_db() as db:
        dup = db.fetchone(
            """
            SELECT 1 FROM tournament.player_accounts
            WHERE LOWER(email) = %s OR LOWER(username) = %s
            """,
            (email, username.lower()),
        )
        if dup:
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email o username.")
        try:
            row = db.fetchone(
                """
                INSERT INTO tournament.player_accounts (email, username, is_admin, user_id)
                VALUES (%s, %s, %s, %s) RETURNING account_id
                """,
                (email, username, body.is_admin, body.user_id),
            )
        except psycopg2.IntegrityError:
            # Carrera con el pre-check, o user_id (UNIQUE) ya enlazado a otra cuenta.
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese email, username o login.")
    return {
        "account_id": row["account_id"], "email": email, "username": username,
        "is_admin": body.is_admin, "user_id": body.user_id,
    }


@router.patch("/players/{account_id}")
def update_player_account(account_id: int, body: UpdatePlayerAccountRequest, me: dict = Depends(require_admin)):
    if body.link_user_id and body.clear_user_id:
        raise HTTPException(status_code=422, detail="No puedes enlazar y desenlazar a la vez.")
    if body.link_user_id:
        try:
            uuid.UUID(body.link_user_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="El identificador del login no es válido.")
    if body.email is None and body.username is None and body.is_admin is None \
            and not body.link_user_id and not body.clear_user_id:
        raise HTTPException(status_code=422, detail="Sin campos para actualizar.")

    with get_db() as db:
        row = db.fetchone(
            """
            SELECT account_id, email, username, is_admin, user_id::text AS user_id
            FROM tournament.player_accounts WHERE account_id = %s
            """,
            (account_id,),
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Cuenta no encontrada.")

        new_email, new_username, new_is_admin = row["email"], row["username"], row["is_admin"]
        email_changed = False

        if body.email is not None:
            email = body.email.strip().lower()
            if "@" not in email:
                raise HTTPException(status_code=422, detail="Email y username son obligatorios.")
            if email != row["email"].lower():
                if db.fetchone(
                    "SELECT 1 FROM tournament.player_accounts WHERE LOWER(email) = %s AND account_id != %s",
                    (email, account_id),
                ):
                    raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo.")
                new_email = email
                email_changed = True

        if body.username is not None:
            username = body.username.strip()
            if not username:
                raise HTTPException(status_code=422, detail="Email y username son obligatorios.")
            if username.lower() != row["username"].lower():
                if db.fetchone(
                    "SELECT 1 FROM tournament.player_accounts WHERE LOWER(username) = %s AND account_id != %s",
                    (username.lower(), account_id),
                ):
                    raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese usuario de Showdown.")
                new_username = username

        if body.is_admin is not None:
            new_is_admin = body.is_admin
        if row["is_admin"] and not new_is_admin:
            if row["email"].lower() == me["email"].lower():
                raise HTTPException(status_code=409, detail="No puedes quitarte a ti mismo el rol de administrador.")
            others = db.fetchone(
                "SELECT COUNT(*) AS n FROM tournament.player_accounts WHERE is_admin AND account_id != %s",
                (account_id,),
            )["n"]
            if others == 0:
                raise HTTPException(status_code=409, detail="Debe quedar al menos un administrador.")

        # Resolución del enlace: enlazar > desenlazar > (email cambió sin enlazar -> desenlaza).
        # La identidad de sesión sale del email (auth.py::require_player), así que un
        # user_id viejo con un email nuevo dejaría al jugador fuera con 403.
        if body.link_user_id:
            dup = db.fetchone(
                "SELECT username FROM tournament.player_accounts WHERE user_id = %s AND account_id != %s",
                (body.link_user_id, account_id),
            )
            if dup:
                raise HTTPException(
                    status_code=409, detail=f'Ese login ya está enlazado a la cuenta de "{dup["username"]}".')
            new_user_id = body.link_user_id
        elif body.clear_user_id:
            new_user_id = None
        elif email_changed:
            new_user_id = None
        else:
            new_user_id = row["user_id"]

        cascade = {"roster": 0, "bans": 0, "whitelist": 0, "participation": 0}
        if new_username.lower() != row["username"].lower():
            cascade = _rename_username_cascade(db, row["username"], new_username)

        db.execute(
            "UPDATE tournament.player_accounts SET email = %s, username = %s, is_admin = %s, user_id = %s "
            "WHERE account_id = %s",
            (new_email, new_username, new_is_admin, new_user_id, account_id),
        )

    return {
        "account_id": account_id, "email": new_email, "username": new_username, "is_admin": new_is_admin,
        "user_id": new_user_id, "cascade": cascade,
        "user_id_cleared": row["user_id"] is not None and new_user_id is None,
    }


@router.delete("/players/{account_id}")
def delete_player_account(account_id: int, me: dict = Depends(require_admin)):
    with get_db() as db:
        row = db.fetchone(
            "SELECT LOWER(email) AS email, is_admin FROM tournament.player_accounts WHERE account_id = %s",
            (account_id,),
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Cuenta no encontrada.")
        if row["email"] == me["email"].lower():
            raise HTTPException(status_code=409, detail="No puedes eliminar tu propia cuenta.")
        if row["is_admin"]:
            others = db.fetchone(
                "SELECT COUNT(*) AS n FROM tournament.player_accounts WHERE is_admin AND account_id != %s",
                (account_id,),
            )["n"]
            if others == 0:
                raise HTTPException(status_code=409, detail="No puedes eliminar al último administrador.")
        db.execute("DELETE FROM tournament.player_accounts WHERE account_id = %s", (account_id,))
    return {"ok": True}


@router.get("/auth-logins", dependencies=[Depends(require_admin)])
def list_auth_logins():
    """
    Logins de Supabase Auth (auth.users) y si ya tienen cuenta en la liga.
    En Postgres local ese esquema no existe: responde `available: false` en vez
    de fallar, para no romper la página de admin en desarrollo.
    """
    with get_db() as db:
        exists = db.fetchone("SELECT to_regclass('auth.users') IS NOT NULL AS ok")["ok"]
        if not exists:
            return {"available": False, "logins": []}
        rows = db.fetchall(
            """
            SELECT u.id::text AS user_id, u.email,
                   u.raw_app_meta_data->>'provider'   AS provider,
                   u.raw_user_meta_data->>'full_name'  AS full_name,
                   u.created_at, u.last_sign_in_at,
                   pa.account_id AS linked_account_id, pa.username AS linked_username
            FROM auth.users u
            LEFT JOIN tournament.player_accounts pa ON pa.user_id = u.id
            WHERE u.deleted_at IS NULL AND NOT u.is_anonymous
            ORDER BY u.last_sign_in_at DESC NULLS LAST
            LIMIT 200
            """
        )
    return {
        "available": True,
        "logins": [
            {**r, "created_at": iso(r["created_at"]), "last_sign_in_at": iso(r["last_sign_in_at"])}
            for r in rows
        ],
    }


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
            "added_at":   iso(r["added_at"]),
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
        season_id = get_active_season_id(db)

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
        season_id = get_active_season_id(db)

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
        db.execute("SELECT battle.refresh_bats_views_concurrently()")
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
        {**r, "battle_date": iso(r["battle_date"])}
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
        db.execute("SELECT battle.refresh_bats_views_concurrently()")
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
            "start_date":    iso(season["start_date"]),
            "is_active":     season["is_active"],
        },
        "bans": [dict(r) for r in bans],
        "progress": {"voted": int(voted), "total": int(authorized)},
    }


@router.get("/rosters", dependencies=[Depends(require_admin)])
def list_rosters():
    """
    Equipos registrados en la temporada activa: nº de pokémon, veredicto del
    TeamValidator real de Showdown (Task 6), cambios usados y si ya fijó lineup.
    """
    with get_db() as db:
        season_id = get_active_season_id(db)
        rows = db.fetchall(
            """
            SELECT r.roster_id, r.username, r.changes_used, r.is_locked, r.registered_at,
                   r.validation_errors, r.validated_at,
                   COUNT(rp.roster_pokemon_id) AS pokemon_count,
                   EXISTS (
                       SELECT 1 FROM tournament.roster_lineup rl WHERE rl.roster_id = r.roster_id
                   ) AS has_lineup
            FROM tournament.roster r
            LEFT JOIN tournament.roster_pokemon rp ON rp.roster_id = r.roster_id
            WHERE r.season_id = %s
            GROUP BY r.roster_id
            ORDER BY LOWER(r.username)
            """,
            (season_id,),
        )

    def validation_of(r: dict) -> dict:
        errors = r["validation_errors"] if isinstance(r["validation_errors"], list) else []
        state = "pending" if r["validated_at"] is None else ("errors" if errors else "ok")
        return {"state": state, "errors": errors, "checked_at": iso(r["validated_at"])}

    return [
        {
            "username":      r["username"],
            "pokemon_count": int(r["pokemon_count"]),
            "changes_used":  r["changes_used"],
            "is_locked":     r["is_locked"],
            "has_lineup":    r["has_lineup"],
            "registered_at": iso(r["registered_at"]),
            "validation":    validation_of(r),
        }
        for r in rows
    ]
