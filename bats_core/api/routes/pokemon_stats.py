"""
BATS — Estadísticas por pokémon de la liga: cómo rinde cada especie en los combates de la comunidad.

Endpoints:
  GET /api/stats/pokemon                → resumen por especie (uso, bring rate, win rate, supervivencia)
  GET /api/stats/pokemon/{species}      → detalle: quién lo usa y qué sets lleva

Pick rate y win rate salen de mv_pick_rate; el "bring rate" (lo llevó al equipo, aunque no
llegara a salir) se cuenta aparte porque las vistas solo consideran los pokémon activos.
Los sets salen de roster_pokemon y solo de rosters PÚBLICOS (registro cerrado o equipo
bloqueado): un set es información competitiva hasta entonces.
"""
from collections import Counter
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..db import get_db

router = APIRouter(prefix="/api/stats/pokemon", tags=["stats"])

# Nombre comparable entre dim_pokemon.species ("Landorus-Therian") y pokemon_cache.name
NORM = "regexp_replace(lower({col}), '[^a-z0-9]', '', 'g')"


def _norm(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _season(season_id: Optional[int], col: str = "season_id") -> tuple[str, tuple]:
    return (f"WHERE {col} = %s", (season_id,)) if season_id is not None else ("", ())


def _slots(db, season_id: Optional[int]) -> int:
    mvf, mvp = _season(season_id)
    row = db.fetchone(
        f"SELECT COALESCE(SUM(total_slots), 0) AS n FROM "
        f"(SELECT DISTINCT season_id, format_name, total_slots FROM battle.mv_pick_rate {mvf}) s", mvp)
    return int(row["n"])


def _brought(db, season_id: Optional[int], species_norm: Optional[str] = None) -> dict[str, int]:
    """Veces que cada especie fue llevada al equipo (activa o en banca)."""
    conds = ["NOT fb.is_bot_battle", "NOT dpl.is_bot"]
    params: list = []
    if season_id is not None:
        conds.append("fb.season_id = %s")
        params.append(season_id)
    if species_norm:
        conds.append(NORM.format(col="dp.species") + " = %s")
        params.append(species_norm)
    rows = db.fetchall(
        f"""
        SELECT dp.species, COUNT(*) AS brought
        FROM battle.fact_pokemon_performance fpp
        JOIN battle.fact_battles fb  ON fb.battle_id  = fpp.battle_id
        JOIN battle.dim_pokemon  dp  ON dp.pokemon_id = fpp.pokemon_id
        JOIN battle.dim_players  dpl ON dpl.player_id = fpp.player_id
        WHERE {' AND '.join(conds)}
        GROUP BY dp.species
        """,
        tuple(params),
    )
    return {r["species"]: int(r["brought"]) for r in rows}


def _survival(db, season_id: Optional[int], species_norm: Optional[str] = None) -> dict[str, tuple[int, int]]:
    """Especie → (veces que terminó viva, veces que salió al campo). Mismo filtro que _brought."""
    conds = ["fpp.was_active", "NOT fb.is_bot_battle", "NOT dpl.is_bot"]
    params: list = []
    if season_id is not None:
        conds.append("fb.season_id = %s")
        params.append(season_id)
    if species_norm:
        conds.append(NORM.format(col="dp.species") + " = %s")
        params.append(species_norm)
    rows = db.fetchall(
        f"""
        SELECT dp.species, SUM(fpp.survived::INT) AS survived, COUNT(*) AS appearances
        FROM battle.fact_pokemon_performance fpp
        JOIN battle.fact_battles fb  ON fb.battle_id  = fpp.battle_id
        JOIN battle.dim_pokemon  dp  ON dp.pokemon_id = fpp.pokemon_id
        JOIN battle.dim_players  dpl ON dpl.player_id = fpp.player_id
        WHERE {' AND '.join(conds)}
        GROUP BY dp.species
        """,
        tuple(params),
    )
    return {r["species"]: (int(r["survived"]), int(r["appearances"])) for r in rows}


def _pct(n: int, total: int) -> Optional[float]:
    return round(100 * n / total, 2) if total else None


@router.get("")
def list_pokedex(season_id: Optional[int] = Query(None)):
    mvf, mvp = _season(season_id)
    with get_db() as db:
        slots = _slots(db, season_id)
        rows = db.fetchall(
            f"""
            SELECT species, SUM(battles_used) AS used,
                   ROUND(100.0 * SUM(wins) / NULLIF(SUM(rows_used), 0), 2)            AS win_rate_pct,
                   ROUND(SUM(total_mvp_score) / NULLIF(SUM(rows_used), 0), 2)         AS avg_mvp,
                   ROUND(SUM(total_kills)::numeric / NULLIF(SUM(rows_used), 0), 2)    AS avg_kills
            FROM battle.mv_pick_rate {mvf}
            GROUP BY species ORDER BY used DESC, species
            """,
            mvp,
        )
        brought = _brought(db, season_id)
        survival = _survival(db, season_id)
    return {
        "total_slots": slots,
        "species": [
            {
                "species": r["species"],
                "used": int(r["used"]),
                "pick_pct": _pct(int(r["used"]), slots),
                "brought": brought.get(r["species"], int(r["used"])),
                "bring_pct": _pct(brought.get(r["species"], int(r["used"])), slots),
                "win_rate_pct": float(r["win_rate_pct"]) if r["win_rate_pct"] is not None else None,
                "avg_mvp": float(r["avg_mvp"] or 0),
                "avg_kills": float(r["avg_kills"] or 0),
                "survival_pct": _pct(*survival.get(r["species"], (0, 0))),
            }
            for r in rows
        ],
    }


@router.get("/{species}")
def get_pokedex_entry(species: str, season_id: Optional[int] = Query(None)):
    key = _norm(species)
    if not key:
        raise HTTPException(status_code=404, detail="Pokémon no encontrado.")
    with get_db() as db:
        match = db.fetchone(
            f"SELECT species FROM battle.dim_pokemon WHERE {NORM.format(col='species')} = %s", (key,))
        cache = db.fetchone(
            f"SELECT name, types, sprite_url, national_dex FROM tournament.pokemon_cache "
            f"WHERE {NORM.format(col='name')} = %s", (key,))
        if not match and not cache:
            raise HTTPException(status_code=404, detail="Pokémon no encontrado.")
        name = match["species"] if match else cache["name"]

        slots = _slots(db, season_id)
        mvf, mvp = _season(season_id)
        agg = db.fetchone(
            f"""
            SELECT COALESCE(SUM(battles_used), 0) AS used, COALESCE(SUM(rows_used), 0) AS rows,
                   COALESCE(SUM(wins), 0) AS wins, COALESCE(SUM(total_kills), 0) AS kills,
                   COALESCE(SUM(total_mvp_score), 0) AS mvp
            FROM battle.mv_pick_rate
            {mvf + (' AND ' if mvf else 'WHERE ')} {NORM.format(col='species')} = %s
            """,
            mvp + (key,),
        )
        used, rows_n = int(agg["used"]), int(agg["rows"])
        brought = _brought(db, season_id, key).get(name, used)
        survived, appearances = _survival(db, season_id, key).get(name, (0, 0))

        umv, ump = _season(season_id)
        users = db.fetchall(
            f"""
            SELECT username, SUM(battles_used) AS uses, SUM(total_kills) AS kills, SUM(total_mvp_score) AS mvp
            FROM battle.mv_mvp_leaderboard
            {umv + (' AND ' if umv else 'WHERE ')} {NORM.format(col='species')} = %s
            GROUP BY username ORDER BY uses DESC, mvp DESC LIMIT 10
            """,
            ump + (key,),
        )

        rs = "AND r.season_id = %s" if season_id is not None else ""
        sets = db.fetchall(
            f"""
            SELECT rp.held_item, rp.ability, rp.nature, rp.tera_type, rp.moves
            FROM tournament.roster_pokemon rp
            JOIN tournament.roster r ON r.roster_id = rp.roster_id
            JOIN tournament.seasons s ON s.season_id = r.season_id
            JOIN tournament.pokemon_cache pc ON pc.pokemon_id = rp.pokemon_id
            WHERE {NORM.format(col='pc.name')} = %s
              AND (r.is_locked OR COALESCE((s.restrictions->>'registration_closed')::boolean, FALSE)) {rs}
            """,
            (key,) + ((season_id,) if season_id is not None else ()),
        )

    def top(counter: Counter, n: int) -> list[dict]:
        return [{"name": k, "count": v} for k, v in counter.most_common(n)]

    moves: Counter = Counter()
    for s in sets:
        if isinstance(s["moves"], list):
            moves.update(m for m in s["moves"] if m)
    return {
        "species": name,
        "types": cache["types"] if cache else None,
        "sprite_url": cache["sprite_url"] if cache else None,
        "national_dex": cache["national_dex"] if cache else None,
        "total_slots": slots,
        "used": used,
        "pick_pct": _pct(used, slots),
        "brought": brought,
        "bring_pct": _pct(brought, slots),
        "win_rate_pct": _pct(int(agg["wins"]), rows_n),
        "avg_kills": round(float(agg["kills"]) / rows_n, 2) if rows_n else 0,
        "avg_mvp": round(float(agg["mvp"]) / rows_n, 2) if rows_n else 0,
        "survival_pct": _pct(survived, appearances),
        "users": [{"username": u["username"], "uses": int(u["uses"]), "kills": int(u["kills"]),
                   "mvp": float(u["mvp"])} for u in users],
        "sets": {
            "players": len(sets),
            "moves": top(moves, 10),
            "items": top(Counter(s["held_item"] for s in sets if s["held_item"]), 5),
            "abilities": top(Counter(s["ability"] for s in sets if s["ability"]), 5),
            "natures": top(Counter(s["nature"] for s in sets if s["nature"]), 5),
            "tera_types": top(Counter(s["tera_type"] for s in sets if s["tera_type"]), 5),
        },
    }
