"""Interruptor de Arena (invariante I12).

`BATS_ARENA_MODE` vale `off` (por defecto), `admins` o `all`. Cualquier otro valor cuenta como
`off`: ante la duda, cerrado. Con `off` las rutas de arena responden 404 sin mirar la sesión.
"""
import os

from fastapi import Depends, HTTPException

from bats_core.api import auth

MODES = ("off", "admins", "all")


def arena_mode() -> str:
    value = os.environ.get("BATS_ARENA_MODE", "").strip().lower()
    return value if value in MODES else "off"


def arena_allows(mode: str, is_admin: bool) -> bool:
    if mode == "all":
        return True
    return mode == "admins" and is_admin


def arena_enabled() -> None:
    """Puerta de router: 404 si Arena está apagada. Corre antes que la autenticación."""
    if arena_mode() == "off":
        raise HTTPException(status_code=404, detail="Not Found")


def require_arena_player(player: dict = Depends(auth.require_player)) -> dict:
    """Jugador con sesión al que el modo actual deja entrar; si no, 404 (no revela que existe)."""
    if not arena_allows(arena_mode(), bool(player.get("is_admin"))):
        raise HTTPException(status_code=404, detail="Not Found")
    return player
