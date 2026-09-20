"""
bats_core/bot/config.py
==================
Configuración centralizada del PGL-Bot.

Para cambiar el tipo del mes, edita WATER_TYPE solo con el tipo en inglés.
Para cambiar la dirección del servidor, edita SERVER_HOST y SERVER_PORT.
"""
from pathlib import Path

from ..paths import ACTIVE_BANS_FILE

# ─── Tipo obligatorio del mes ─────────────────────────────────────────────────
# Cambia este valor cada mes. Debe ser el tipo en inglés tal como lo usa poke-env.
# Ejemplos: "Water", "Fire", "Grass", "Electric", "Psychic", "Dragon"
TYPE_OF_MONTH = "Ice"

# ─── Conexión al servidor ─────────────────────────────────────────────────────
SERVER_HOST = "localhost"
SERVER_PORT = 8000

# ─── Identidad del bot ────────────────────────────────────────────────────────
BOT_USERNAME = "PGL-Bot"
BOT_PASSWORD = None  # None = sin contraseña (servidor local sin auth)

# ─── Formato del torneo ───────────────────────────────────────────────────────
# ID generado por PS: toID("[Gen 9] PinchesGueys League") = "gen9pinchesgueys"
BATTLE_FORMAT = "gen9pinchesgueysleague"

# ─── Reglas del formato (para validación interna del team builder) ────────────
MAX_RESTRICTED = 1   # máximo 1 legendary/sub-legendary por equipo
TEAM_SIZE = 6

# ─── Archivo de bans activos (generado por BATS) ─────────────────────────────
BANS_FILE = ACTIVE_BANS_FILE
