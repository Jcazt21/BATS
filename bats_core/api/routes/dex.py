"""Metadatos públicos del snapshot del dex que valida la API."""
from fastapi import APIRouter, HTTPException

from ..common import iso
from ..db import get_db

router = APIRouter(prefix="/api/dex", tags=["dex"])


@router.get("/meta")
def dex_meta():
    """Permite comparar la versión estática del frontend con la importada en Postgres."""
    with get_db() as db:
        row = db.fetchone(
            """SELECT generated_at, ps_commit, species_count, imported_at
               FROM tournament.dex_meta WHERE only_row = TRUE"""
        )
    if not row:
        raise HTTPException(status_code=503, detail="dex_not_loaded")
    return {
        "generated_at": iso(row["generated_at"]),
        "ps_commit": row["ps_commit"],
        "species_count": row["species_count"],
        "imported_at": iso(row["imported_at"]),
    }
