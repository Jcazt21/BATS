"""
BATS — Ingesta por push y tareas programadas.

Reemplaza al watcher de filesystem: en vez de que BATS vigile una carpeta de
logs, el server de Pokémon Showdown envía cada batalla por HTTPS al terminar.

  POST /api/ingest/battle         PS → BATS  (Bearer BATS_INGEST_TOKEN)
  POST /api/ingest/refresh-views  PS → BATS  (Bearer BATS_INGEST_TOKEN), con debounce en PS
  GET  /api/cron/refresh-views    Vercel Cron, respaldo diario (Bearer CRON_SECRET)
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import service_token
from ..db import get_db
from ...db.etl import load_pushed
from ...parser import parse_battle_dict

router = APIRouter(prefix="/api", tags=["ingest"])

require_ingest_token = service_token("BATS_INGEST_TOKEN")
require_cron_secret = service_token("CRON_SECRET")


class IngestBattleRequest(BaseModel):
    # battle.fact_battles.battle_id es VARCHAR(80)
    battle_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,79}$", description="p.ej. gen9pinchesgueysleague-249")
    format: str = Field(pattern=r"^[a-z0-9]{1,60}$", description="id del formato, p.ej. gen9pinchesgueysleague")
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="YYYY-MM-DD")
    log: dict = Field(description="Contenido del .log.json de PS (p1, p2, winner, turns, log, ...)")


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
