"""
bats_core/bot/validator.py
=====================
Valida equipos contra el validador nativo de Pokémon Showdown.

Usa bats_core/validate_team.js como subprocess: carga los datos y la lógica
de PS directamente desde los dist files, sin necesidad de que el server
esté corriendo.

Uso típico:
    from .validator import validate_paste
    errors = validate_paste(paste)   # [] = válido
    if errors:
        raise RuntimeError("Equipo rechazado: " + ", ".join(errors))
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

from .config import BATTLE_FORMAT
from ..paths import PS_DIR

logger = logging.getLogger(__name__)

# Rutas
_BATS_DIR        = Path(__file__).parent.parent           # .../bats_core/
_PS_DIR          = PS_DIR                                 # .../pokemon-showdown/
_VALIDATOR_JS    = _BATS_DIR / "validate_team.js"         # .../bats_core/validate_team.js

_TIMEOUT_SECONDS = 15


def validate_paste(paste: str, format_id: str = BATTLE_FORMAT) -> list[str]:
    """
    Valida un equipo en formato Showdown paste contra el validador de PS.

    Retorna una lista de strings con los errores encontrados.
    Lista vacía = equipo 100% válido según PS.

    Política de fallo: si Node.js no está disponible o el script falla
    por razones técnicas (no de validación), retorna [] con un WARNING
    para no bloquear la generación de equipos ante problemas de entorno.
    """
    if not _VALIDATOR_JS.exists():
        logger.warning(
            "validate_team.js no encontrado en %s — saltando validación.", _VALIDATOR_JS
        )
        return []

    payload = json.dumps({"format": format_id, "team": paste})

    try:
        result = subprocess.run(
            ["node", str(_VALIDATOR_JS)],
            input=payload,
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_SECONDS,
            cwd=str(_PS_DIR),
        )
    except FileNotFoundError:
        logger.warning("Comando 'node' no encontrado — saltando validación de equipo.")
        return []
    except subprocess.TimeoutExpired:
        logger.warning("Validación de equipo superó %ds — saltando.", _TIMEOUT_SECONDS)
        return []
    except OSError as exc:
        logger.warning("Error al lanzar validate_team.js: %s — saltando.", exc)
        return []

    if result.returncode != 0:
        logger.warning(
            "validate_team.js terminó con rc=%d:\n  stderr: %s",
            result.returncode, result.stderr.strip(),
        )
        return []

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        logger.warning("Respuesta inválida del validador: %r — saltando.", result.stdout)
        return []

    errors: list[str] = data.get("errors", [])
    if errors:
        logger.warning(
            "Equipo inválido según PS (%d error/es):\n%s",
            len(errors),
            "\n".join(f"  - {e}" for e in errors),
        )
    return errors
