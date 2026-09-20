"""
BATS — Rutas compartidas.

BATS vive en su propio repo, hermano de pokemon-showdown/. Todo lo que
necesita del server de PS (logs, active_bans.json, dist/sim) se resuelve
desde aquí. Cada ruta se puede sobreescribir por variable de entorno:

  BATS_PS_DIR             raíz del server de PS   (default: ../pokemon-showdown)
  BATS_LOGS_DIR           carpeta de logs de PS   (default: <PS_DIR>/logs)
  BATS_ACTIVE_BANS_FILE   bans activos compartido (default: <PS_DIR>/active_bans.json)
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BATS_DIR = Path(__file__).parent      # .../bats/bats_core
REPO_ROOT = BATS_DIR.parent           # .../bats
ENV_FILE = REPO_ROOT / ".env"

# Antes de leer os.environ, para que el .env pueda definir los overrides.
load_dotenv(ENV_FILE)

PS_DIR = Path(os.environ.get("BATS_PS_DIR", REPO_ROOT.parent / "pokemon-showdown"))
LOGS_DIR = Path(os.environ.get("BATS_LOGS_DIR", PS_DIR / "logs"))
ACTIVE_BANS_FILE = Path(os.environ.get("BATS_ACTIVE_BANS_FILE", PS_DIR / "active_bans.json"))
