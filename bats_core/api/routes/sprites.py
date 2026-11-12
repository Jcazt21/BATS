"""
BATS — Sprites de los pokémon (3D o pixel art Gen 5), servidos desde el propio API.

Endpoints (públicos). `style` es `3d` (por defecto) o `gen5`:
  GET /api/sprites/{spriteid}/info → {"animated": bool, "width": int, "height": int}
  GET /api/sprites/{spriteid}      → el sprite: GIF animado si existe, PNG estático si no
                                      (?still=1 fuerza el PNG, para quien reduce el movimiento)

Los sprites viven en Pokémon Showdown. Se sirven desde aquí (en vez de enlazarlos desde el navegador) porque:
  · Showdown no envía CORS: un canvas que dibuje sus imágenes queda "contaminado".
  · El API sabe cuáles tienen animación y de qué tamaño (tablas `pokedex-mini*.js` de Showdown), así que
    el frontend no tiene que probar un GIF y caer al PNG tras un 404.
  · Nada de esto se guarda en el repo ni en disco: las tablas se cachean en memoria y las imágenes las
    cachea el CDN (`s-maxage`).
`spriteid` es el de Showdown ("scizor-mega"); el dex de BATS lo trae en cada especie.
"""
import logging
import re
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sprites", tags=["sprites"])

_SHOWDOWN = "https://play.pokemonshowdown.com"
# Showdown está detrás de Cloudflare: sin User-Agent responde 403.
_HEADERS = {"User-Agent": "bats-api/1.0 (+sprites)"}
_TIMEOUT = 10
_MAX_BYTES = 2 * 1024 * 1024
_SPRITEID = re.compile(r"^[a-z0-9-]{1,40}$")  # también cierra la puerta a rutas arbitrarias en la URL de Showdown

# Las imágenes no cambian: el navegador las guarda un día y el CDN de Vercel un mes.
_CACHE_CONTROL = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800"

_TABLE_TTL = 24 * 3600
_TABLE_RETRY = 60  # si Showdown falla, no se martillea: se reintenta al minuto

Style = Literal["3d", "gen5"]


@dataclass(frozen=True)
class _Source:
    table_url: str     # tabla de Showdown con el tamaño del GIF de cada especie que lo tiene
    gif_dir: str       # carpeta de GIF animados
    still_dir: str     # carpeta de PNG estáticos
    still_ext: str
    still_size: int    # lado del PNG estático (cuadrado)


_SOURCES: dict[str, _Source] = {
    # Modelos 3D (Gen 6+): GIF en `ani/`, PNG 3D de 120×120 en `dex/`.
    "3d": _Source(f"{_SHOWDOWN}/data/pokedex-mini.js", f"{_SHOWDOWN}/sprites/ani", f"{_SHOWDOWN}/sprites/dex", "png", 120),
    # Pixel art de Blanco/Negro: GIF en `gen5ani/`, PNG de 96×96 en `gen5/`.
    "gen5": _Source(f"{_SHOWDOWN}/data/pokedex-mini-bw.js", f"{_SHOWDOWN}/sprites/gen5ani", f"{_SHOWDOWN}/sprites/gen5", "png", 96),
}

_lock = threading.Lock()
_tables: dict[str, dict[str, tuple[int, int] | None]] = {}
_expires: dict[str, float] = {}

_ENTRY = re.compile(r"^\t(\w+):\{(.*)\},?$", re.M)
_FRONT = re.compile(r"front:\{w:(\d+),h:(\d+)\}")


def parse_table(source: str) -> dict[str, tuple[int, int] | None]:
    """
    Tabla de Showdown → {id: (ancho, alto) del GIF animado, o None si esa especie no tiene animación}.
    Solo las entradas con `front:{w,h}` tienen GIF.
    """
    out: dict[str, tuple[int, int] | None] = {}
    for m in _ENTRY.finditer(source):
        front = _FRONT.search(m.group(2))
        out[m.group(1)] = (int(front.group(1)), int(front.group(2))) if front else None
    return out


def _download(url: str) -> bytes | None:
    """Descarga acotada; None si no existe o falla (el motivo queda en el log)."""
    req = urllib.request.Request(url, headers=_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as res:
            data = res.read(_MAX_BYTES + 1)
    except urllib.error.HTTPError as e:
        if e.code != 404:
            logger.warning("Showdown respondió %s para %s", e.code, url)
        return None
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        logger.warning("No se pudo leer %s: %s", url, e)
        return None
    return data if len(data) <= _MAX_BYTES else None


def _load_table(style: str) -> dict[str, tuple[int, int] | None]:
    with _lock:
        if time.monotonic() < _expires.get(style, 0.0):
            return _tables.get(style, {})
        raw = _download(_SOURCES[style].table_url)
        parsed = parse_table(raw.decode("utf-8", "replace")) if raw else {}
        if parsed:
            _tables[style], _expires[style] = parsed, time.monotonic() + _TABLE_TTL
        else:
            # Sin tabla: se conserva la anterior (si la hay) y se reintenta pronto.
            _expires[style] = time.monotonic() + _TABLE_RETRY
        return _tables.get(style, {})


def _reset_cache() -> None:
    """Vacía las tablas en memoria (tests)."""
    with _lock:
        _tables.clear()
        _expires.clear()


def _key(spriteid: str) -> str:
    return spriteid.replace("-", "")


def _check(spriteid: str) -> None:
    if not _SPRITEID.match(spriteid):
        raise HTTPException(status_code=400, detail="spriteid inválido.")


@router.get("/{spriteid}/info")
def sprite_info(spriteid: str, response: Response, style: Style = "3d"):
    """Si la especie tiene sprite animado y de qué tamaño (el GIF viene recortado a lo opaco)."""
    _check(spriteid)
    src = _SOURCES[style]
    table = _load_table(style)
    if table and _key(spriteid) not in table:
        raise HTTPException(status_code=404, detail="Sprite no encontrado.")
    size = table.get(_key(spriteid))
    response.headers["Cache-Control"] = "public, max-age=3600, s-maxage=86400"
    if size:
        return {"animated": True, "width": size[0], "height": size[1]}
    return {"animated": False, "width": src.still_size, "height": src.still_size}


@router.get("/{spriteid}")
def sprite_image(spriteid: str, style: Style = "3d", still: bool = Query(False, description="Fuerza el PNG estático")):
    """El sprite: GIF animado si existe (y no se pide `still`), PNG estático si no."""
    _check(spriteid)
    src = _SOURCES[style]
    data, media = None, "image/png"
    if not still and _load_table(style).get(_key(spriteid)):
        data = _download(f"{src.gif_dir}/{spriteid}.gif")
        media = "image/gif"
    if data is None:
        data, media = _download(f"{src.still_dir}/{spriteid}.{src.still_ext}"), "image/png"
    if data is None:
        raise HTTPException(status_code=404, detail="Sprite no encontrado.")
    return Response(content=data, media_type=media, headers={"Cache-Control": _CACHE_CONTROL})
