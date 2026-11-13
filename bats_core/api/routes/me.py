"""
BATS — Identidad de la sesión.

  GET   /api/me   → {username, email, is_admin, avatar} de quien llama
  PATCH /api/me   → cambia el sprite de entrenador del carnet ({"avatar": id | null})

Lo usa el frontend para saber quién es el usuario (nombre para su perfil, si mostrar el
acceso a administración). El servidor sigue decidiendo los permisos en cada ruta.
La cuenta sale siempre de la sesión: el body nunca dice de quién es el cambio.
"""
from fastapi import APIRouter, Depends, HTTPException
from psycopg2.errors import UndefinedColumn

from ..auth import require_player
from ..db import get_db
from ..schemas import UpdateAvatarRequest
from ...trainers import is_valid

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("")
def get_me(player: dict = Depends(require_player)):
    # Si la migración v13 aún no se aplicó, la columna no existe: sin sprite en vez de 500,
    # para no tumbar el carnet ni "Mi equipo" por un desfase entre código y base.
    try:
        with get_db() as db:
            row = db.fetchone(
                "SELECT avatar FROM tournament.player_accounts WHERE LOWER(email) = %s",
                (player["email"].lower(),),
            )
    except UndefinedColumn:
        row = None
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
