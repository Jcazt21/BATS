"""
BATS — Utilidades del blog (sin base de datos).

slugify: título → slug estable para la URL (/blog/<slug>). Se calcula una vez al
         crear la entrada y no cambia aunque luego se edite el título.
excerpt: Markdown → texto plano corto para la lista de entradas. Se guarda al
         escribir para que la lista no tenga que leer el contenido completo.
"""
import re
import unicodedata

MAX_CHARS = 200_000   # mismo límite que web/src/lib/blog.ts::BLOG_MAX_CHARS
TITLE_MAX = 160
SLUG_MAX = 100
EXCERPT_MAX = 180


def slugify(title: str) -> str:
    text = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return slug[:SLUG_MAX].rstrip("-") or "entrada"


# Orden importante: primero lo que contiene otras marcas (bloques de código, imágenes).
_CLEANUP = [
    (re.compile(r"```.*?```", re.S), " "),                       # bloques de código
    (re.compile(r"!\[[^\]]*\]\([^)]*\)"), " "),                  # imágenes
    (re.compile(r"\[([^\]]*)\]\([^)]*\)"), r"\1"),               # enlaces → su texto
    (re.compile(r"<[^>]+>"), " "),                               # HTML
    (re.compile(r"^\s*[-:| ]{3,}\s*$", re.M), " "),              # separadores de tabla / reglas
    (re.compile(r"^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+", re.M), ""),  # marcas de bloque
    (re.compile(r"[*_`~|]"), " "),                               # énfasis, código, celdas
]


def excerpt(markdown: str, title: str = "", limit: int = EXCERPT_MAX) -> str:
    body = markdown
    first = re.match(r"\s*#\s+(.+?)\s*(?:\n|$)", body)
    if first and title and first.group(1).strip().lower() == title.strip().lower():
        body = body[first.end():]   # el H1 inicial suele repetir el título
    for pattern, repl in _CLEANUP:
        body = pattern.sub(repl, body)
    text = " ".join(body.split())
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)   # «vota .» → «vota.» tras quitar el énfasis
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(" ,.;:") + "…"
