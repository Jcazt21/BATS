"""
BATS API — Conexión a PostgreSQL.

Lee la configuración del archivo .env en la raíz del proyecto.
No requiere variables de entorno manuales — solo configura .env una vez.
"""
from pathlib import Path
from dotenv import load_dotenv

from bats_core.paths import ENV_FILE

# Cargar .env desde la raíz del proyecto (bats/.env)
_ENV_FILE = ENV_FILE
load_dotenv(_ENV_FILE)

from bats_core.db.connection import BATSDatabase  # noqa: E402 (import after load_dotenv)


def get_db() -> BATSDatabase:
    """Retorna una instancia de BATSDatabase lista para usar como context manager."""
    return BATSDatabase()
