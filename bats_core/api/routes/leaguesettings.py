"""
BATS — Configuración de la liga (reglas de la temporada activa).

Endpoints:
  GET   /api/admin/leaguesettings  → configuración completa de la temporada activa
  PATCH /api/admin/leaguesettings  → actualiza campos y/o restricciones

Diseño de restricciones:
  Las restricciones de torneo viven en tournament.seasons.restrictions (JSONB) y su
  definición (RESTRICTION_SPEC) en bats_core/rules.py: añadir una restricción no
  requiere migración de BD.
"""
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ...rules import RESTRICTION_SPEC, RuleError, normalize_restrictions, validate_restriction
from ..auth import require_admin
from ..db import get_db
from ..schemas import UpdateLeagueSettingsRequest

router = APIRouter(prefix="/api/admin/leaguesettings", tags=["leaguesettings"])


def _validate_restriction(key: str, value: Any) -> Any:
    """Valida un valor de restricción (spec en bats_core/rules.py); RuleError → 422."""
    try:
        return validate_restriction(key, value)
    except RuleError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _build_response(row: dict) -> dict:
    raw = row["restrictions"]
    # psycopg2 may return JSONB as str; parse if needed
    if isinstance(raw, str):
        raw = json.loads(raw)
    return {
        "season_id":        row["season_id"],
        "season_name":      row["season_name"],
        "type_of_month":    row["type_of_month"],
        "max_team_size":    row["max_team_size"],
        "max_team_changes": row["max_team_changes"],
        "restrictions":     normalize_restrictions(raw),
        "restriction_spec": {
            k: {fk: fv for fk, fv in v.items() if fk not in ("type",)}
            for k, v in RESTRICTION_SPEC.items()
        },
    }


@router.get("")
def get_league_settings(_: dict = Depends(require_admin)):
    """Retorna la configuración y las restricciones de la temporada activa."""
    with get_db() as db:
        row = db.fetchone(
            """
            SELECT season_id, season_name, type_of_month,
                   max_team_size, max_team_changes, restrictions
            FROM tournament.seasons
            WHERE is_active = TRUE
            LIMIT 1
            """
        )
    if not row:
        raise HTTPException(status_code=404, detail="No hay temporada activa.")
    return _build_response(row)


@router.patch("")
def update_league_settings(
    body: UpdateLeagueSettingsRequest,
    _: dict = Depends(require_admin),
):
    """
    Actualiza campos básicos y/o restricciones de la temporada activa.
    Las restricciones son mergeadas: solo se sobreescriben las claves enviadas.
    Enviar null en una clave nullable la elimina (sin restricción).
    """
    fields: list[str] = []
    params: list      = []

    if body.type_of_month is not None:
        fields.append("type_of_month = %s")
        params.append(body.type_of_month)

    if body.max_team_size is not None:
        if body.max_team_size < 1:
            raise HTTPException(status_code=422, detail="max_team_size debe ser ≥ 1.")
        fields.append("max_team_size = %s")
        params.append(body.max_team_size)

    if body.max_team_changes is not None:
        if body.max_team_changes < 0:
            raise HTTPException(status_code=422, detail="max_team_changes debe ser ≥ 0.")
        fields.append("max_team_changes = %s")
        params.append(body.max_team_changes)

    if body.restrictions is not None:
        # Validate each key sent
        validated: dict[str, Any] = {}
        for key, value in body.restrictions.items():
            validated[key] = _validate_restriction(key, value)

        non_null  = {k: v for k, v in validated.items() if v is not None}
        null_keys = [k for k, v in validated.items() if v is None]

        # Build a SINGLE expression so PostgreSQL doesn't discard earlier assignments:
        #   restrictions = (restrictions || merge_json) - ARRAY[null_keys]
        expr = "restrictions"
        extra_params: list = []

        if non_null:
            expr = f"({expr} || %s::jsonb)"
            extra_params.append(json.dumps(non_null))

        if null_keys:
            placeholders = ", ".join(["%s"] * len(null_keys))
            expr = f"({expr} - ARRAY[{placeholders}]::text[])"
            extra_params.extend(null_keys)

        fields.append(f"restrictions = {expr}")
        params.extend(extra_params)

    if not fields:
        raise HTTPException(status_code=422, detail="No se proporcionó ningún campo a actualizar.")

    with get_db() as db:
        row = db.fetchone(
            f"""
            UPDATE tournament.seasons
            SET {", ".join(fields)}
            WHERE is_active = TRUE
            RETURNING season_id, season_name, type_of_month, max_team_size, max_team_changes, restrictions
            """,
            tuple(params),
        )
        if not row:
            raise HTTPException(status_code=404, detail="No hay temporada activa.")

    return _build_response(row)
