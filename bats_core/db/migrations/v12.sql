-- =============================================================================
-- BATS — Migración v12: blog de la liga
-- =============================================================================
-- Los admins suben un .md desde el panel; se guarda el Markdown tal cual y lo
-- pinta el frontend (sin HTML crudo). `excerpt` se calcula en la API al escribir
-- (bats_core/blog.py) para que la lista no lea el contenido completo.
--
-- is_published = FALSE → borrador: invisible en /api/blog.
-- published_at se fija la PRIMERA vez que se publica y se conserva al despublicar,
-- para que volver a publicar no la mande al principio de la lista.
-- author_username es una firma (snapshot), no una FK: renombrar la cuenta no la cambia.

CREATE TABLE IF NOT EXISTS tournament.blog_posts (
  post_id         SERIAL       PRIMARY KEY,
  slug            VARCHAR(120) NOT NULL UNIQUE,
  title           VARCHAR(160) NOT NULL,
  content_md      TEXT         NOT NULL CHECK (char_length(content_md) <= 200000),
  excerpt         VARCHAR(200) NOT NULL DEFAULT '',
  author_username VARCHAR(50),
  is_published    BOOLEAN      NOT NULL DEFAULT FALSE,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published
  ON tournament.blog_posts (published_at DESC) WHERE is_published;
