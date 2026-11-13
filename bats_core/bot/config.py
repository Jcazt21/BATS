"""
bats_core/bot/config.py
==================
Configuración centralizada del PGL-Bot.

Para cambiar la dirección del servidor, edita SERVER_HOST y SERVER_PORT.

TYPE_OF_MONTH describe para qué tipo están armados los pools de sets (sets.py).
La regla vigente sale de BATS (active_rules.json); si difiere, `rules_drift()` lo avisa.
"""
import json
from typing import Optional

from ..league import LEAGUE_FORMAT
from ..paths import ACTIVE_BANS_FILE, ACTIVE_RULES_FILE

# ─── Tipo del mes para el que están armados los pools de sets ────────────────
# El tipo obligatorio real lo define la temporada activa en BATS (active_rules.json).
# Los pools de sets.py (ICE_OU_POOL, GEN5_POOL...) son datos curados a mano: al cambiar
# el tipo del mes hay que reemplazar el pool correspondiente y actualizar este valor.
# En inglés, como lo usa poke-env: "Water", "Fire", "Grass"...
TYPE_OF_MONTH = "Ice"

# ─── Conexión al servidor ─────────────────────────────────────────────────────
SERVER_HOST = "localhost"
SERVER_PORT = 8000

# ─── Identidad del bot ────────────────────────────────────────────────────────
BOT_USERNAME = "PGL-Bot"
BOT_PASSWORD = None  # None = sin contraseña (servidor local sin auth)

# ─── Formato del torneo ───────────────────────────────────────────────────────
# ID generado por PS: toID("[Gen 9] PinchesGueys League") = "gen9pinchesgueys"
BATTLE_FORMAT = LEAGUE_FORMAT

# ─── Reglas del formato (para validación interna del team builder) ────────────
MAX_RESTRICTED = 1   # máximo 1 legendary/sub-legendary por equipo
TEAM_SIZE = 6

# ─── Archivo de bans activos (generado por BATS) ─────────────────────────────
BANS_FILE = ACTIVE_BANS_FILE


def active_rules_type_of_month() -> Optional[str]:
    """Tipo del mes que exige la temporada activa (active_rules.json), o None si no se puede leer."""
    try:
        data = json.loads(ACTIVE_RULES_FILE.read_text(encoding="utf-8"))
        value = data.get("type_of_month")
        return value if isinstance(value, str) and value else None
    except (OSError, ValueError, AttributeError):
        return None


def rules_drift() -> Optional[str]:
    """
    Mensaje de advertencia si el tipo del mes de la temporada activa no coincide con el
    de los pools del bot (los equipos que arme serían rechazados por el formato). None si
    coinciden o si no hay reglas que comparar.
    """
    active = active_rules_type_of_month()
    if active is None or active.lower() == TYPE_OF_MONTH.lower():
        return None
    return (
        f"La temporada activa exige el tipo {active}, pero los sets del bot están armados "
        f"para {TYPE_OF_MONTH} (bot/config.py, bot/sets.py). Sus equipos no pasarán la "
        f"validación del formato hasta que se actualicen los pools."
    )
