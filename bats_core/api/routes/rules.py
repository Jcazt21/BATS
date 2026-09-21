"""
BATS — Reglas activas de la liga (públicas, solo lectura).

Endpoints:
  GET /api/rules/active  → tipo del mes, restricciones normalizadas y bans votados

Lo consume el plugin bats-ingest de Pokémon Showdown, que lo guarda como
active_rules.json para que config/formats.ts valide los equipos con las reglas de la
temporada activa (y el PGL-Bot lea el tipo del mes). Es información de reglas ya
pública: no expone jugadores ni votos individuales.
"""
from fastapi import APIRouter

from ...rules import active_rules_payload
from ..common import get_active_season, voted_ban_names
from ..db import get_db

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("/active")
def get_active_rules():
    with get_db() as db:
        season = get_active_season(db)
        bans = voted_ban_names(db, season["season_id"])
    return active_rules_payload(season, bans)
