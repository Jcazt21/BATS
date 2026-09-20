"""
BATS — ETL Cleaner: gestión de las batallas ya cargadas.

Solo opera sobre la base de datos. Las batallas llegan por push
(POST /api/ingest/battle), ya no hay archivos de log que listar ni borrar
desde la API: el filesystem de una función serverless es efímero y de solo lectura.

Endpoints:
  POST   /api/admin/etl/run     → recalcula temporadas y refresca vistas
  GET    /api/admin/etl/files   → lista lo registrado en battle.etl_log con info de batalla
  DELETE /api/admin/etl/files   → borra batallas (fact_battles + etl_log) por clave
"""
from pathlib import PurePosixPath
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_admin
from ..db import get_db
from ...db.etl import PUSH_KEY_PREFIX

router = APIRouter(prefix="/api/admin/etl", tags=["etl-cleaner"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class DeleteFilesRequest(BaseModel):
    # Valores de `file_path` tal como los devuelve GET /files. Para batallas
    # empujadas por la API es 'push:<battle_id>'; para las cargadas antes de la
    # migración es la ruta absoluta que tenía el log en disco.
    file_paths: List[str]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/run", dependencies=[Depends(require_admin)])
def recalculate():
    """
    Recalcula la asignación de temporadas y refresca las vistas materializadas:
      1. Deja sin temporada las batallas cuya fecha ya no cae en el rango de su season.
      2. backfill_seasons() — reasigna season_id según los rangos actuales.
      3. Refresca las vistas materializadas (sin bloquear lecturas).

    Ya NO procesa logs: la carga de batallas ocurre en POST /api/ingest/battle.
    Se conserva la forma de la respuesta (bloque `etl` en cero) para no romper
    a los clientes existentes.
    """
    seasons_reset = 0
    seasons_updated = 0
    seasons_error: str | None = None
    try:
        with get_db() as db:
            # Reset batallas fuera del rango de su temporada actual
            db.execute("""
                UPDATE battle.fact_battles fb
                SET season_id = NULL
                FROM tournament.seasons s
                WHERE fb.season_id = s.season_id
                  AND fb.battle_date NOT BETWEEN s.start_date
                      AND COALESCE(s.end_date, CURRENT_DATE)
            """)
            reset_row = db.fetchone("SELECT COUNT(*) AS n FROM battle.fact_battles WHERE season_id IS NULL")
            seasons_reset = int(reset_row["n"]) if reset_row else 0

            # Re-asignar según rangos actuales
            row = db.fetchone("SELECT * FROM battle.backfill_seasons()")
            seasons_updated = int(row["updated_count"]) if row else 0

            db.execute("SELECT battle.refresh_bats_views_concurrently()")
    except Exception as exc:
        seasons_error = str(exc)

    return {
        "ok":              seasons_error is None,
        "etl": {"loaded": 0, "skipped": 0, "errors": 0, "total": 0},
        "seasons": {
            "reset":   seasons_reset,
            "updated": seasons_updated,
            "error":   seasons_error,
        },
    }


@router.get("/files", dependencies=[Depends(require_admin)])
def list_etl_files():
    """
    Lista todo lo registrado en battle.etl_log, enriquecido con datos de la
    batalla (formato, jugadores, ganador, temporada, violaciones).
    """
    query = """
        SELECT
            el.log_id, el.file_path, el.file_size, el.battle_id,
            el.status, el.error_msg, el.processed_at,
            fb.battle_date, fb.total_turns, fb.end_type,
            df.format_name,
            p1.username AS p1_username,
            p2.username AS p2_username,
            CASE WHEN fb.winner_id = fb.p1_id THEN p1.username
                 WHEN fb.winner_id = fb.p2_id THEN p2.username
                 ELSE NULL END AS winner_username,
            s.season_name,
            COUNT(v.violation_id) AS violation_count
        FROM battle.etl_log el
        LEFT JOIN battle.fact_battles        fb  ON fb.battle_id = el.battle_id
        LEFT JOIN battle.dim_formats         df  ON df.format_id = fb.format_id
        LEFT JOIN battle.dim_players         p1  ON p1.player_id = fb.p1_id
        LEFT JOIN battle.dim_players         p2  ON p2.player_id = fb.p2_id
        LEFT JOIN tournament.seasons         s   ON s.season_id  = fb.season_id
        LEFT JOIN battle.fact_ban_violations v   ON v.battle_id  = el.battle_id
        GROUP BY
            el.log_id, el.file_path, el.file_size, el.battle_id,
            el.status, el.error_msg, el.processed_at,
            fb.battle_date, fb.total_turns, fb.end_type,
            df.format_name, p1.username, p2.username,
            fb.winner_id, fb.p1_id, fb.p2_id, s.season_name
        ORDER BY el.processed_at DESC
    """
    with get_db() as db:
        rows = db.fetchall(query)

    def _display_name(file_path: str, battle_id: str | None) -> str:
        # Batallas por push: no hay archivo, el nombre útil es el id de la batalla.
        if file_path.startswith(PUSH_KEY_PREFIX):
            return file_path[len(PUSH_KEY_PREFIX):]
        # Cargadas desde disco antes de la migración: el nombre del log.
        # (Las rutas guardadas son de otro SO/máquina, por eso no se usa pathlib.Path.)
        return PurePosixPath(file_path.replace("\\", "/")).name or (battle_id or file_path)

    return [
        {
            "log_id":          r["log_id"],
            "file_path":       r["file_path"],
            "file_name":       _display_name(r["file_path"], r["battle_id"]),
            "file_size":       r["file_size"],
            "battle_id":       r["battle_id"],
            "status":          r["status"],
            "error_msg":       r["error_msg"],
            "processed_at":    r["processed_at"].isoformat() if r["processed_at"] else None,
            "battle_date":     r["battle_date"].isoformat() if r["battle_date"] else None,
            "total_turns":     r["total_turns"],
            "end_type":        r["end_type"],
            "format_name":     r["format_name"],
            "p1_username":     r["p1_username"],
            "p2_username":     r["p2_username"],
            "winner_username": r["winner_username"],
            "season_name":     r["season_name"],
            "violation_count": int(r["violation_count"]),
        }
        for r in rows
    ]


@router.delete("/files", dependencies=[Depends(require_admin)])
def delete_etl_files(body: DeleteFilesRequest):
    """
    Borra masivamente batallas de la base de datos por su clave de etl_log.

    Para cada file_path recibido:
      1. Borra la batalla de battle.fact_battles (cascada: performance + violations).
      2. Borra el registro de battle.etl_log.

    No toca ningún archivo: los .log.json quedan en el server de PS. Si se
    vuelven a enviar (push o backfill), la batalla se carga de nuevo.
    """
    if not body.file_paths:
        raise HTTPException(status_code=422, detail="La lista de rutas no puede estar vacía.")

    with get_db() as db:
        placeholders = ",".join(["%s"] * len(body.file_paths))
        battle_rows = db.fetchall(
            f"SELECT file_path, battle_id FROM battle.etl_log WHERE file_path IN ({placeholders})",
            tuple(body.file_paths),
        )
        battle_ids = [r["battle_id"] for r in battle_rows if r["battle_id"]]

        # 1. fact_battles (cascada a fact_pokemon_performance y fact_ban_violations)
        if battle_ids:
            bp = ",".join(["%s"] * len(battle_ids))
            db.execute(
                f"DELETE FROM battle.fact_battles WHERE battle_id IN ({bp})",
                tuple(battle_ids),
            )

        # 2. etl_log
        db.execute(
            f"DELETE FROM battle.etl_log WHERE file_path IN ({placeholders})",
            tuple(body.file_paths),
        )

    return {
        "ok":              True,
        "removed_entries": len(battle_rows),
        "battles_removed": len(battle_ids),
    }
