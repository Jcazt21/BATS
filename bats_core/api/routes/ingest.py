"""
BATS — Ingesta por push y tareas programadas.

Reemplaza al watcher de filesystem: en vez de que BATS vigile una carpeta de
logs, el server de Pokémon Showdown envía cada batalla por HTTPS al terminar.

  POST /api/ingest/battle         PS → BATS  (Bearer BATS_INGEST_TOKEN)
  POST /api/ingest/roster-validation       → veredictos del TeamValidator
  POST /api/ingest/refresh-views  PS → BATS  (Bearer BATS_INGEST_TOKEN), con debounce en PS
  GET  /api/cron/refresh-views    Vercel Cron, respaldo diario (Bearer CRON_SECRET)
"""
import json

from fastapi import APIRouter, Depends

from ..auth import service_token
from ..common import get_active_season
from ..db import get_db
from ..schemas import IngestBattleRequest, RosterValidationRequest
from ...db.etl import load_pushed
from ...parser import parse_battle_dict

router = APIRouter(prefix="/api", tags=["ingest"])

require_ingest_token = service_token("BATS_INGEST_TOKEN")
require_cron_secret = service_token("CRON_SECRET")


@router.post("/ingest/battle")
def ingest_battle(body: IngestBattleRequest, _: None = Depends(require_ingest_token)):
    """
    Carga una batalla. Idempotente por battle_id: reenviar la misma batalla
    responde 'skipped' sin duplicar nada, así que PS puede reintentar sin riesgo.

    status:
      loaded  — se cargó.
      skipped — ya estaba cargada, o es una batalla contra el bot.
      ignored — el log no es válido o es de prueba (< 3 turnos). No reintentar.

    Un error de DB responde 500 (PS debe reintentar).
    """
    # Validar primero: un log inválido o de prueba no debe costar una conexión a la DB
    # (en serverless cada conexión es un handshake contra el pooler).
    battle = parse_battle_dict(body.log, body.battle_id, body.date, body.format, source=body.battle_id)
    if battle is None:
        return {"status": "ignored", "battle_id": body.battle_id}

    with get_db() as db:
        status = load_pushed(db, battle)
    return {"status": status, "battle_id": body.battle_id}


@router.post("/ingest/roster-validation")
def ingest_roster_validation(
    body: RosterValidationRequest,
    _: None = Depends(require_ingest_token),
):
    """
    Guarda el resultado del TeamValidator de Showdown para cada roster activo.

    Una lista vacía significa que el equipo es válido. Los usernames que no
    tienen roster en la temporada activa se ignoran: el plugin puede enviar una
    foto completa sin sincronizar altas y bajas de forma especial.
    """
    normalized = {
        username.strip().lower(): list(errors)
        for username, errors in body.results.items()
        if username.strip()
    }
    updated = 0
    with get_db() as db:
        season = get_active_season(db)
        for username, errors in normalized.items():
            row = db.fetchone(
                """
                UPDATE tournament.roster
                SET validation_errors = %s::jsonb,
                    validated_at = NOW(),
                    validated_commit = %s
                WHERE season_id = %s AND LOWER(username) = %s
                RETURNING roster_id
                """,
                (json.dumps(errors), body.ps_commit or None, season["season_id"], username),
            )
            if row:
                updated += 1
    return {"ok": True, "updated": updated}


def _refresh_views() -> None:
    with get_db() as db:
        db.execute("SELECT battle.refresh_bats_views_concurrently()")


@router.post("/ingest/refresh-views")
def ingest_refresh_views(_: None = Depends(require_ingest_token)):
    """
    Refresca las vistas materializadas sin bloquear las lecturas.

    La ingesta no las refresca (sería un lock exclusivo por batalla). El plugin
    de PS llama a este endpoint con debounce (una vez por ráfaga de batallas),
    así las estadísticas se actualizan casi en tiempo real sin depender de un
    cron (que en el plan Hobby de Vercel solo puede ser diario).
    """
    _refresh_views()
    return {"ok": True}


@router.get("/cron/refresh-views")
def cron_refresh_views(_: None = Depends(require_cron_secret)):
    """
    Respaldo periódico del refresh, invocado por Vercel Cron.
    Vercel envía `Authorization: Bearer $CRON_SECRET` si esa variable existe.
    """
    _refresh_views()
    return {"ok": True}
