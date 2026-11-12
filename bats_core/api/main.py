"""
BATS API — Servidor FastAPI principal.

Arrancar con:
  python3 -m bats_core api
"""
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ..paths import ENV_FILE

load_dotenv(ENV_FILE)

from .routes import ban, admin, stats, seasons, etl_cleaner, leaguesettings, teams, ingest, rules, players, pokedex, me, dex, blog, sprites  # noqa: E402

logger = logging.getLogger(__name__)

app = FastAPI(
    title="BATS API",
    description="Battle Analyzing and Tracking System — Backend",
    version="1.0.0",
)

# En Vercel el SPA y la API comparten origen, así que CORS no hace falta. Solo se
# habilita si se define BATS_CORS_ORIGINS (lista separada por comas), p.ej. para
# desarrollar el frontend contra una API remota.
_cors_origins = [o.strip() for o in os.environ.get("BATS_CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["*"],
    )

app.include_router(ban.router)
app.include_router(admin.router)
app.include_router(stats.router)
app.include_router(seasons.router)
app.include_router(etl_cleaner.router)
app.include_router(leaguesettings.router)
app.include_router(teams.router)
app.include_router(ingest.router)
app.include_router(rules.router)
app.include_router(players.router)
app.include_router(pokedex.router)
app.include_router(me.router)
app.include_router(dex.router)
app.include_router(sprites.router)
app.include_router(blog.router)
app.include_router(blog.admin_router)


@app.exception_handler(Exception)
async def _cors_safe_500(request: Request, exc: Exception):
    """
    Errores no controlados: respuesta 500 genérica.

    El detalle NO se devuelve al cliente (los mensajes de psycopg2 incluyen SQL,
    nombres de tablas y parámetros): queda en el log del servidor.
    """
    logger.exception("Error no controlado en %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor."},
    )


@app.get("/health")
@app.get("/api/health")   # en Vercel solo /api/* llega a la función; /health lo captura el SPA
def health():
    return {"status": "ok", "service": "BATS API"}


def serve():
    """
    Servidor LOCAL de desarrollo: `python3 -m bats_core api`.

    En Vercel no se usa: api/index.py exporta `app` y Vercel la sirve como ASGI.
    Ya no arranca el watcher de logs; la ingesta es por push (POST /api/ingest/battle).
    """
    import uvicorn

    host = os.environ.get("BATS_API_HOST", "0.0.0.0")
    port = int(os.environ.get("BATS_API_PORT", 8011))
    uvicorn.run("bats_core.api.main:app", host=host, port=port, reload=True)
