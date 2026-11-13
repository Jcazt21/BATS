"""
BATS — Identidad de la sesión.

  GET   /api/me   → {username, email, is_admin, avatar} de quien llama
  PATCH /api/me   → cambia el sprite de entrenador del carnet ({"avatar": id | null})

Lo usa el frontend para saber quién es el usuario (nombre para su perfil, si mostrar el
acceso a administración). El servidor sigue decidiendo los permisos en cada ruta.
La cuenta sale siempre de la sesión: el body nunca dice de quién es el cambio.
"""
from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_player
from ..db import get_db
from ..schemas import UpdateAvatarRequest
from ...trainers import is_valid

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("")
def get_me(player: dict = Depends(require_player)):
    with get_db() as db:
        row = db.fetchone(
            "SELECT avatar FROM tournament.player_accounts WHERE LOWER(email) = %s",
            (player["email"].lower(),),
        )
    return {
        "username": player["username"],
        "email": player["email"],
        "is_admin": player["is_admin"],
        "avatar": row["avatar"] if row else None,
    }


@router.patch("")
def update_me(body: UpdateAvatarRequest, player: dict = Depends(require_player)):
    if body.avatar is not None and not is_valid(body.avatar):
        raise HTTPException(status_code=422, detail="Sprite de entrenador no válido.")
    with get_db() as db:
        db.execute(
            "UPDATE tournament.player_accounts SET avatar = %s WHERE LOWER(email) = %s",
            (body.avatar, player["email"].lower()),
        )
    return {"avatar": body.avatar}
