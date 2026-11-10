"""
BATS — Perfil público de jugador.

Endpoints:
  GET /api/players/{username}   → récord, MVPs, pokémon más usados, racha, historial y (si
                                  el registro está cerrado) el roster

Récord y MVP salen de las vistas materializadas (las mismas que el leaderboard); racha
e historial, de las batallas. Es información de liga ya pública en /api/stats/*.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ...rules import normalize_restrictions
from ..common import iso
from ..db import get_db

router = APIRouter(prefix="/api/players", tags=["players"])


def _mv_filter(season_id: Optional[int]) -> tuple[str, tuple]:
    return ("AND season_id = %s", (season_id,)) if season_id is not None else ("", ())


def _streak(results: list[bool]) -> dict:
    """`results` de más reciente a más antiguo (True = victoria)."""
    if not results:
        return {"type": None, "length": 0}
    first, n = results[0], 0
    for r in results:
        if r != first:
            break
        n += 1
    return {"type": "win" if first else "loss", "length": n}


def _best_win_streak(results: list[bool]) -> int:
    """Mejor racha de victorias seguidas. `results` en cualquier orden cronológico (True = victoria)."""
    best = run = 0
    for r in results:
        run = run + 1 if r else 0
        best = max(best, run)
    return best


def _badges(wins: int, best_streak: int, is_mvp_leader: bool) -> list[dict]:
    """Insignias del carnet. Todas salen siempre (`earned` dice si se ganó) para que el
    front pinte las bloqueadas sin saber las reglas."""
    return [
        {"id": "first_win", "glyph": "★", "label": "Primera victoria", "earned": wins >= 1},
        {"id": "streak_3", "glyph": "3×", "label": "Racha de 3 victorias", "earned": best_streak >= 3},
        {"id": "mvp", "glyph": "M", "label": "MVP de la liga", "earned": is_mvp_leader},
        {"id": "streak_5", "glyph": "5×", "label": "Racha de 5 victorias", "earned": best_streak >= 5},
    ]


@router.get("/{username}")
def get_player(username: str, season_id: Optional[int] = Query(None)):
    key = username.strip().lower()
    mvf, mvp = _mv_filter(season_id)
    with get_db() as db:
        player = db.fetchone(
            "SELECT player_id, username, first_seen, last_seen FROM battle.dim_players "
            "WHERE LOWER(username) = %s AND NOT is_bot",
            (key,),
        )
        if not player:
            raise HTTPException(status_code=404, detail="Jugador no encontrado.")
        name = player["username"]

        record = db.fetchone(
            f"""
            SELECT COALESCE(SUM(total_battles), 0) AS battles, COALESCE(SUM(wins), 0) AS wins,
                   COALESCE(SUM(total_survivors), 0) AS survivors
            FROM battle.mv_player_stats WHERE username = %s {mvf}
            """,
            (name,) + mvp,
        )
        mvp_row = db.fetchone(
            f"""
            SELECT COALESCE(SUM(total_mvp_score), 0) AS mvp, COALESCE(SUM(total_kills), 0) AS kills
            FROM battle.mv_mvp_leaderboard WHERE username = %s {mvf}
            """,
            (name,) + mvp,
        )
        top = db.fetchall(
            f"""
            SELECT species, SUM(battles_used) AS uses, SUM(total_kills) AS kills,
                   SUM(total_mvp_score) AS mvp,
                   ROUND(SUM(total_mvp_score) / NULLIF(SUM(battles_used), 0), 2) AS avg_mvp
            FROM battle.mv_mvp_leaderboard WHERE username = %s {mvf}
            GROUP BY species ORDER BY uses DESC, mvp DESC LIMIT 6
            """,
            (name,) + mvp,
        )

        mvp_leader = db.fetchone(
            f"""
            SELECT username FROM battle.mv_mvp_leaderboard
            WHERE TRUE {mvf}
            ORDER BY total_mvp_score DESC LIMIT 1
            """,
            mvp,
        )

        sf = "AND fb.season_id = %s" if season_id is not None else ""
        sp = (season_id,) if season_id is not None else ()
        games = db.fetchall(
            f"""
            SELECT fb.battle_id, fb.battle_date, fb.total_turns, fb.end_type, fb.season_id,
                   fb.winner_id = %s AS won,
                   CASE WHEN fb.p1_id = %s THEN o2.username ELSE o1.username END AS opponent
            FROM battle.fact_battles fb
            JOIN battle.dim_players o1 ON o1.player_id = fb.p1_id
            JOIN battle.dim_players o2 ON o2.player_id = fb.p2_id
            WHERE NOT fb.is_bot_battle AND (fb.p1_id = %s OR fb.p2_id = %s) {sf}
            ORDER BY fb.battle_date DESC, fb.logged_at DESC
            """,
            (player["player_id"],) * 4 + sp,
        )

        roster = _published_roster(db, key)

    forfeits = sum(1 for g in games if g["end_type"] == "forfeit" and not g["won"])
    battles = int(record["battles"])
    wins = int(record["wins"])
    return {
        "username": name,
        "first_seen": iso(player["first_seen"]),
        "last_seen": iso(player["last_seen"]),
        "record": {
            "battles": battles,
            "wins": wins,
            "losses": battles - wins,
            "win_rate_pct": round(100 * wins / battles, 2) if battles else None,
            "forfeits": forfeits,
            "survivors": int(record["survivors"]),
        },
        "mvp": {"total": float(mvp_row["mvp"]), "kills": int(mvp_row["kills"])},
        "streak": _streak([bool(g["won"]) for g in games]),
        "badges": _badges(
            wins,
            _best_win_streak([bool(g["won"]) for g in reversed(games)]),
            bool(mvp_leader and mvp_leader["username"] == name),
        ),
        "top_pokemon": [
            {"species": t["species"], "uses": int(t["uses"]), "kills": int(t["kills"]),
             "mvp": float(t["mvp"]), "avg_mvp": float(t["avg_mvp"] or 0)}
            for t in top
        ],
        "recent": [
            {"battle_id": g["battle_id"], "date": iso(g["battle_date"]), "opponent": g["opponent"],
             "won": bool(g["won"]), "turns": g["total_turns"], "end_type": g["end_type"]}
            for g in games[:10]
        ],
        "roster": roster,
    }


def _published_roster(db, username_lower: str) -> Optional[dict]:
    """Roster de la temporada activa, solo si el registro está cerrado o el equipo bloqueado."""
    season = db.fetchone(
        "SELECT season_id, season_name, restrictions FROM tournament.seasons WHERE is_active = TRUE "
        "ORDER BY created_at DESC LIMIT 1"
    )
    if not season:
        return None
    roster = db.fetchone(
        "SELECT roster_id, is_locked FROM tournament.roster WHERE season_id = %s AND LOWER(username) = %s",
        (season["season_id"], username_lower),
    )
    if not roster:
        return None
    if not (roster["is_locked"] or normalize_restrictions(season["restrictions"])["registration_closed"]):
        return None
    rows = db.fetchall(
        """
        SELECT pc.name, pc.types, pc.sprite_url, rp.held_item, rp.ability, rp.nature, rp.tera_type, rp.moves,
               EXISTS (SELECT 1 FROM tournament.roster_lineup rl
                       WHERE rl.roster_id = rp.roster_id AND rl.pokemon_id = rp.pokemon_id) AS in_lineup
        FROM tournament.roster_pokemon rp
        JOIN tournament.pokemon_cache pc ON pc.pokemon_id = rp.pokemon_id
        WHERE rp.roster_id = %s ORDER BY rp.added_at
        """,
        (roster["roster_id"],),
    )
    return {
        "season_name": season["season_name"],
        "pool": [
            {"name": r["name"], "types": r["types"], "sprite_url": r["sprite_url"], "held_item": r["held_item"],
             "ability": r["ability"], "nature": r["nature"], "tera_type": r["tera_type"],
             "moves": r["moves"] if isinstance(r["moves"], list) else [], "in_lineup": r["in_lineup"]}
            for r in rows
        ],
    }
