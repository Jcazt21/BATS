"""
BATS — Configuración de la liga (reglas de la temporada activa).

Endpoints:
  GET   /api/admin/leaguesettings  → configuración completa de la temporada activa
  PATCH /api/admin/leaguesettings  → actualiza campos y/o restricciones

Diseño de restricciones:
  Las restricciones de torneo viven en tournament.seasons.restrictions (JSONB).
  Para agregar una nueva restricción basta con extender RESTRICTION_SPEC:
  no se requieren migraciones de BD.

  Tipo de restricciones soportadas:
    "enum"  – valor de un conjunto fijo de strings; nullable=True permite NULL (sin restricción)
    "int"   – entero con rango; nullable=True permite NULL (sin restricción)
    "bool"  – booleano, default False (ausente = False)
"""
import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_admin
from ..db import get_db

router = APIRouter(prefix="/api/admin/leaguesettings", tags=["leaguesettings"])


# ── Restriction spec ──────────────────────────────────────────────────────────
# To add a new restriction: append a new entry here. No DB migration required.

RESTRICTION_SPEC: dict[str, dict[str, Any]] = {
    "required_color": {
        "type":     "enum",
        "values":   ["black", "blue", "brown", "gray", "green",
                     "pink", "purple", "red", "white", "yellow"],
        "nullable": True,
        "label":    "Color requerido",
        "hint":     "Al menos un pokémon del equipo debe ser de este color.",
    },
    "required_generation": {
        "type":     "int",
        "min":      1,
        "max":      9,
        "nullable": True,
        "label":    "Generación requerida",
        "hint":     "Al menos un pokémon del equipo debe ser de esta generación.",
    },
    "required_egg_group": {
        "type":     "enum",
        "values":   ["monster", "water1", "water2", "water3", "bug", "flying",
                     "field", "fairy", "grass", "human-like", "mineral",
                     "amorphous", "ditto", "dragon", "undiscovered"],
        "nullable": True,
        "label":    "Egg Group requerido",
        "hint":     "Al menos un pokémon del equipo debe pertenecer a este egg group.",
    },
    "item_clause": {
        "type":    "bool",
        "default": False,
        "label":   "Item Clause",
        "hint":    "No se puede repetir el mismo objeto entre los pokémon del equipo.",
    },
}


def _validate_restriction(key: str, value: Any) -> Any:
    """Valida y normaliza un valor de restricción. Lanza HTTPException si es inválido."""
    if key not in RESTRICTION_SPEC:
        raise HTTPException(status_code=422, detail=f"Restricción desconocida: '{key}'")
    spec = RESTRICTION_SPEC[key]

    if value is None:
        if spec.get("nullable"):
            return None
        raise HTTPException(status_code=422, detail=f"'{key}' no puede ser nulo.")

    if spec["type"] == "enum":
        if value not in spec["values"]:
            raise HTTPException(
                status_code=422,
                detail=f"'{key}': valor inválido '{value}'. Opciones: {spec['values']}",
            )
        return value

    if spec["type"] == "int":
        if not isinstance(value, int):
            raise HTTPException(status_code=422, detail=f"'{key}' debe ser un entero.")
        if not (spec["min"] <= value <= spec["max"]):
            raise HTTPException(
                status_code=422,
                detail=f"'{key}' debe estar entre {spec['min']} y {spec['max']}.",
            )
        return value

    if spec["type"] == "bool":
        if not isinstance(value, bool):
            raise HTTPException(status_code=422, detail=f"'{key}' debe ser un booleano.")
        return value

    return value  # unknown type, pass through


def _normalize_restrictions(raw: dict | None) -> dict:
    """Devuelve las restricciones con defaults aplicados y sin claves desconocidas."""
    raw = raw or {}
    result: dict[str, Any] = {}
    for key, spec in RESTRICTION_SPEC.items():
        val = raw.get(key)
        if val is None and spec.get("nullable"):
            result[key] = None
        elif val is None:
            result[key] = spec.get("default", False)
        else:
            result[key] = val
    return result


class UpdateLeagueSettingsRequest(BaseModel):
    type_of_month:    Optional[str]        = None
    max_team_size:    Optional[int]        = None
    max_team_changes: Optional[int]        = None
    restrictions:     Optional[dict[str, Any]] = None  # merged into current


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
        "restrictions":     _normalize_restrictions(raw),
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
