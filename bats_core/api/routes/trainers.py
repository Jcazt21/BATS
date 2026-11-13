"""
BATS — Sprites de entrenador de Showdown, servidos desde el propio API (públicos).

  GET /api/trainers        → catálogo curado [{id, label, category}] (bats_core/trainers.py)
  GET /api/trainers/{id}   → el PNG del sprite

Mismo motivo que /api/sprites: Showdown no envía CORS, y así solo se sirven los del catálogo
(la allowlist cierra la puerta a rutas arbitrarias en la URL de Showdown). Nada se guarda en
disco; las imágenes las cachea el CDN.
"""
from fastapi import APIRouter, HTTPException, Response

from .sprites import _CACHE_CONTROL, _SHOWDOWN, _download
from ...trainers import catalog, is_valid

router = APIRouter(prefix="/api/trainers", tags=["trainers"])


@router.get("")
def list_trainers(response: Response):
    response.headers["Cache-Control"] = "public, max-age=3600, s-maxage=86400"
    return catalog()


@router.get("/{trainer_id}")
def trainer_image(trainer_id: str):
    if not is_valid(trainer_id):
        raise HTTPException(status_code=404, detail="Sprite no encontrado.")
    data = _download(f"{_SHOWDOWN}/sprites/trainers/{trainer_id}.png")
    if data is None:
        raise HTTPException(status_code=404, detail="Sprite no encontrado.")
    return Response(content=data, media_type="image/png", headers={"Cache-Control": _CACHE_CONTROL})
