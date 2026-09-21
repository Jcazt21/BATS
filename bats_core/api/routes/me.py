"""
BATS — Identidad de la sesión.

  GET /api/me   → {username, email, is_admin} de quien llama

Lo usa el frontend para saber quién es el usuario (nombre para su perfil, si mostrar el
acceso a administración). El servidor sigue decidiendo los permisos en cada ruta.
"""
from fastapi import APIRouter, Depends

from ..auth import require_player

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("")
def get_me(player: dict = Depends(require_player)):
    return {"username": player["username"], "email": player["email"], "is_admin": player["is_admin"]}
