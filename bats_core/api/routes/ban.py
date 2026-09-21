"""
BATS — Rutas de votación anónima de bans.

Endpoints:
  GET  /api/ban/me           → ¿puede votar la sesión actual? (requiere sesión)
  POST /api/ban/submit       → registra el voto (anónimo) de la sesión actual
  GET  /api/ban/ranking      → ranking de pokémon más votados
  GET  /api/ban/status       → estado general de la votación
  GET  /api/ban/active       → pokémon votados en la temporada activa (lo consume PS)
  GET  /api/ban/candidates   → pokémon dominantes (win rate alto) con sus votos actuales

La identidad del votante sale de la sesión (JWT), nunca del body. Autenticar quién
puede votar no implica registrar qué votó: ban_votes no referencia al votante.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import require_player
from ..common import get_active_season_id, upsert_pokemon, voted_ban_names
from ..crypto import hash_username
from ..db import get_db
from ..schemas import SubmitBanRequest

router = APIRouter(prefix="/api/ban", tags=["ban"])


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/me")
def check_user(player: dict = Depends(require_player)):
    voter_hash = hash_username(player["username"])

    with get_db() as db:
        season_id = get_active_season_id(db)

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
def submit_ban(body: SubmitBanRequest, player: dict = Depends(require_player)):
    voter_hash = hash_username(player["username"])

    with get_db() as db:
        season_id = get_active_season_id(db)

        can = db.fetchone(
            "SELECT tournament.can_vote(%s, %s) AS val",
            (voter_hash, season_id),
        )["val"]
        if not can:
            raise HTTPException(status_code=403, detail="No autorizado o ya registraste tu ban.")

        pokemon_id = upsert_pokemon(
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
        season_id = get_active_season_id(db)

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
        season_id = get_active_season_id(db)
        bans = voted_ban_names(db, season_id)
    return {"season_id": season_id, "bans": bans}


@router.get("/candidates")
def get_ban_candidates(min_battles: int = Query(3, ge=1, le=100), season_id: Optional[int] = Query(None)):
    """
    Ban Radar: pokémon con win rate > 70% (vista mv_ban_candidates) y al menos
    `min_battles` batallas —con pocas, un 100% no significa nada—, junto a los votos que
    ya tienen en la temporada activa. Es agregado y público, igual que /ranking.
    """
    with get_db() as db:
        active = get_active_season_id(db)
        rows = db.fetchall(
            """
            SELECT c.species, c.format_name, c.battles_used, c.avg_kills, c.avg_mvp_score, c.win_rate_pct,
                   COALESCE(v.total_votes, 0) AS votes, v.sprite_url
            FROM battle.mv_ban_candidates c
            LEFT JOIN LATERAL (
                SELECT r.total_votes, r.sprite_url
                FROM tournament.v_ban_ranking r
                WHERE r.season_id = %s
                  AND regexp_replace(lower(r.pokemon_name), '[^a-z0-9]', '', 'g') = regexp_replace(lower(c.species), '[^a-z0-9]', '', 'g')
            ) v ON TRUE
            WHERE c.season_id = %s AND c.battles_used >= %s
            ORDER BY c.win_rate_pct DESC, c.battles_used DESC
            """,
            (active, season_id if season_id is not None else active, min_battles),
        )
    return [
        {**r, "avg_kills": float(r["avg_kills"] or 0), "avg_mvp_score": float(r["avg_mvp_score"] or 0),
         "win_rate_pct": float(r["win_rate_pct"])}
        for r in rows
    ]
