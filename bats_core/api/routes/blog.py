"""
BATS — Blog de la liga.

Públicos (solo entradas publicadas):
  GET    /api/blog                  → lista: título, extracto, autor, fecha
  GET    /api/blog/{slug}           → entrada completa (Markdown crudo; lo pinta el cliente)

Admin:
  GET    /api/admin/blog            → todas, incluidos borradores
  GET    /api/admin/blog/{id}       → una, con contenido (para previsualizar borradores)
  POST   /api/admin/blog            → crea una entrada desde un .md (borrador o publicada)
  PATCH  /api/admin/blog/{id}       → título / contenido / publicación (el slug no cambia)
  DELETE /api/admin/blog/{id}       → elimina

El Markdown se guarda tal cual: el frontend lo pinta sin HTML crudo
(web/src/components/blog/Markdown.tsx), así que aquí no se sanea.
"""
from fastapi import APIRouter, Depends, HTTPException

from ...blog import excerpt, slugify
from ..auth import require_admin
from ..common import iso
from ..db import get_db
from ..schemas import CreateBlogPostRequest, UpdateBlogPostRequest

router = APIRouter(prefix="/api/blog", tags=["blog"])
admin_router = APIRouter(prefix="/api/admin/blog", tags=["blog"], dependencies=[Depends(require_admin)])

_META = "post_id, slug, title, excerpt, author_username, is_published, published_at, created_at, updated_at"


def _summary(row) -> dict:
    return {
        "post_id": row["post_id"], "slug": row["slug"], "title": row["title"], "excerpt": row["excerpt"],
        "author": row["author_username"], "published_at": iso(row["published_at"]),
    }


def _admin(row) -> dict:
    out = {**_summary(row), "is_published": row["is_published"],
           "created_at": iso(row["created_at"]), "updated_at": iso(row["updated_at"])}
    if "content_md" in row:
        out["content_md"] = row["content_md"]
    return out


def _clean(title: str, content: str) -> tuple[str, str]:
    title = title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="La entrada necesita un título.")
    if not content.strip():
        raise HTTPException(status_code=422, detail="El archivo está vacío.")
    return title, content


def _unique_slug(db, title: str) -> str:
    base = slugify(title)
    taken = {r["slug"] for r in db.fetchall(
        "SELECT slug FROM tournament.blog_posts WHERE slug = %s OR slug LIKE %s", (base, base + "-%"))}
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


# ── Públicos ──────────────────────────────────────────────────────────────────

@router.get("")
def list_posts():
    with get_db() as db:
        rows = db.fetchall(
            f"SELECT {_META} FROM tournament.blog_posts WHERE is_published "
            "ORDER BY published_at DESC, post_id DESC LIMIT 50"
        )
    return [_summary(r) for r in rows]


@router.get("/{slug}")
def get_post(slug: str):
    with get_db() as db:
        row = db.fetchone(
            f"SELECT {_META}, content_md FROM tournament.blog_posts WHERE slug = %s AND is_published",
            (slug.strip().lower(),),
        )
    if not row:
        raise HTTPException(status_code=404, detail="Entrada no encontrada.")
    return {**_summary(row), "content_md": row["content_md"], "updated_at": iso(row["updated_at"])}


# ── Admin ─────────────────────────────────────────────────────────────────────

@admin_router.get("")
def admin_list_posts():
    with get_db() as db:
        rows = db.fetchall(f"SELECT {_META} FROM tournament.blog_posts ORDER BY created_at DESC, post_id DESC")
    return [_admin(r) for r in rows]


@admin_router.get("/{post_id}")
def admin_get_post(post_id: int):
    with get_db() as db:
        row = db.fetchone(f"SELECT {_META}, content_md FROM tournament.blog_posts WHERE post_id = %s", (post_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Entrada no encontrada.")
    return _admin(row)


@admin_router.post("", status_code=201)
def create_post(body: CreateBlogPostRequest, admin: dict = Depends(require_admin)):
    title, content = _clean(body.title, body.content_md)
    with get_db() as db:
        row = db.fetchone(
            f"""
            INSERT INTO tournament.blog_posts
                (slug, title, content_md, excerpt, author_username, is_published, published_at)
            VALUES (%s, %s, %s, %s, %s, %s, CASE WHEN %s THEN NOW() END)
            RETURNING {_META}, content_md
            """,
            (_unique_slug(db, title), title, content, excerpt(content, title), admin["username"],
             body.publish, body.publish),
        )
    return _admin(row)


@admin_router.patch("/{post_id}")
def update_post(post_id: int, body: UpdateBlogPostRequest):
    if body.title is None and body.content_md is None and body.is_published is None:
        raise HTTPException(status_code=422, detail="No hay cambios que guardar.")
    with get_db() as db:
        cur = db.fetchone(
            "SELECT title, content_md, is_published FROM tournament.blog_posts WHERE post_id = %s FOR UPDATE",
            (post_id,),
        )
        if not cur:
            raise HTTPException(status_code=404, detail="Entrada no encontrada.")
        title, content = _clean(
            cur["title"] if body.title is None else body.title,
            cur["content_md"] if body.content_md is None else body.content_md,
        )
        published = cur["is_published"] if body.is_published is None else body.is_published
        row = db.fetchone(
            f"""
            UPDATE tournament.blog_posts
            SET title = %s, content_md = %s, excerpt = %s, is_published = %s,
                published_at = CASE WHEN %s THEN COALESCE(published_at, NOW()) ELSE published_at END,
                updated_at = NOW()
            WHERE post_id = %s
            RETURNING {_META}, content_md
            """,
            (title, content, excerpt(content, title), published, published, post_id),
        )
    return _admin(row)


@admin_router.delete("/{post_id}")
def delete_post(post_id: int):
    with get_db() as db:
        row = db.fetchone("DELETE FROM tournament.blog_posts WHERE post_id = %s RETURNING post_id", (post_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Entrada no encontrada.")
    return {"ok": True}
