"""
tests/test_blog_api.py
======================
Blog: CRUD admin (/api/admin/blog) y lectura pública (/api/blog). Los borradores
no se filtran por ningún endpoint público. Necesita una base DESECHABLE en BATS_TEST_DSN.
"""
import os
import unittest
import uuid
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from bats_core.api import auth
from bats_core.api.main import app
from bats_core.db.connection import BATSDatabase

DSN = os.environ.get("BATS_TEST_DSN")


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestBlogApi(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        db_dir = Path(__file__).parent.parent / "bats_core" / "db"
        with BATSDatabase(DSN) as db:
            db.apply_schema(db_dir / "schema.sql")
            db.apply_migrations(db_dir / "migrations")

    def setUp(self):
        env = mock.patch.dict(os.environ, {"BATS_DB_DSN": DSN})
        env.start()
        self.addCleanup(env.stop)
        self.tag = uuid.uuid4().hex[:8]
        self.addCleanup(self._cleanup)
        app.dependency_overrides[auth.require_admin] = lambda: {
            "user_id": "u-admin", "email": "admin@x.test", "username": f"Admin{self.tag}", "is_admin": True,
        }
        self.client = TestClient(app, raise_server_exceptions=False)

    def _cleanup(self):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM tournament.blog_posts WHERE author_username = %s", (f"Admin{self.tag}",))
        app.dependency_overrides.clear()

    def _create(self, title=None, content="Hola liga.", publish=False):
        return self.client.post("/api/admin/blog", json={
            "title": title or f"Novedades {self.tag}", "content_md": content, "publish": publish,
        })

    def _public_slugs(self):
        return {p["slug"] for p in self.client.get("/api/blog").json()}

    # ── Crear ──────────────────────────────────────────────────────────────────

    def test_borrador_no_es_publico(self):
        res = self._create()
        self.assertEqual(res.status_code, 201)
        post = res.json()
        self.assertEqual(post["slug"], f"novedades-{self.tag}")
        self.assertFalse(post["is_published"])
        self.assertIsNone(post["published_at"])
        self.assertEqual(post["author"], f"Admin{self.tag}")
        self.assertNotIn(post["slug"], self._public_slugs())
        self.assertEqual(self.client.get(f"/api/blog/{post['slug']}").status_code, 404)

    def test_publicada_aparece_con_extracto(self):
        title = f"Novedades {self.tag}"
        post = self._create(title=title, content=f"# {title}\n\nLa **temporada** empieza.", publish=True).json()
        self.assertTrue(post["is_published"])
        self.assertIsNotNone(post["published_at"])
        listed = next(p for p in self.client.get("/api/blog").json() if p["slug"] == post["slug"])
        self.assertEqual(listed["excerpt"], "La temporada empieza.")
        self.assertNotIn("content_md", listed)
        full = self.client.get(f"/api/blog/{post['slug']}").json()
        self.assertEqual(full["content_md"], f"# {title}\n\nLa **temporada** empieza.")

    def test_titulos_repetidos_tienen_slugs_distintos(self):
        a = self._create(title=f"Repetido {self.tag}").json()["slug"]
        b = self._create(title=f"Repetido {self.tag}").json()["slug"]
        c = self._create(title=f"Repetido {self.tag}").json()["slug"]
        self.assertEqual([a, b, c], [f"repetido-{self.tag}", f"repetido-{self.tag}-2", f"repetido-{self.tag}-3"])

    def test_validaciones(self):
        self.assertEqual(self._create(title="   ").status_code, 422)
        self.assertEqual(self._create(content="  \n ").status_code, 422)
        self.assertEqual(self._create(content="x" * 200_001).status_code, 422)
        self.assertEqual(self._create(title="t" * 161).status_code, 422)

    # ── Editar ─────────────────────────────────────────────────────────────────

    def test_publicar_despublicar_conserva_fecha(self):
        post = self._create().json()
        pid = post["post_id"]
        first = self.client.patch(f"/api/admin/blog/{pid}", json={"is_published": True}).json()["published_at"]
        self.assertIsNotNone(first)
        hidden = self.client.patch(f"/api/admin/blog/{pid}", json={"is_published": False}).json()
        self.assertEqual(hidden["published_at"], first)
        self.assertNotIn(post["slug"], self._public_slugs())
        again = self.client.patch(f"/api/admin/blog/{pid}", json={"is_published": True}).json()
        self.assertEqual(again["published_at"], first)

    def test_cambiar_titulo_no_cambia_slug_y_contenido_rehace_extracto(self):
        post = self._create().json()
        res = self.client.patch(f"/api/admin/blog/{post['post_id']}", json={
            "title": f"Otro título {self.tag}", "content_md": "Texto nuevo.",
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["slug"], post["slug"])
        self.assertEqual(res.json()["title"], f"Otro título {self.tag}")
        self.assertEqual(res.json()["excerpt"], "Texto nuevo.")

    def test_patch_sin_campos_e_inexistente(self):
        pid = self._create().json()["post_id"]
        self.assertEqual(self.client.patch(f"/api/admin/blog/{pid}", json={}).status_code, 422)
        self.assertEqual(self.client.patch("/api/admin/blog/999999", json={"is_published": True}).status_code, 404)

    # ── Admin: leer y borrar ───────────────────────────────────────────────────

    def test_admin_ve_borradores_con_contenido(self):
        post = self._create(content="Secreto.").json()
        self.assertIn(post["post_id"], {p["post_id"] for p in self.client.get("/api/admin/blog").json()})
        self.assertEqual(self.client.get(f"/api/admin/blog/{post['post_id']}").json()["content_md"], "Secreto.")

    def test_borrar(self):
        pid = self._create().json()["post_id"]
        self.assertEqual(self.client.delete(f"/api/admin/blog/{pid}").json(), {"ok": True})
        self.assertEqual(self.client.delete(f"/api/admin/blog/{pid}").status_code, 404)

    def test_sin_sesion_no_puede_escribir(self):
        app.dependency_overrides.clear()
        self.assertEqual(self._create().status_code, 401)
        self.assertEqual(self.client.get("/api/admin/blog").status_code, 401)
