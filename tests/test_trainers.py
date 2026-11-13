"""
tests/test_trainers.py
======================
Sprite de entrenador del carnet: catálogo, proxy de imágenes y PATCH /api/me.
La red y la base se simulan; no necesita base de datos.
"""
import unittest
from unittest import mock

from fastapi.testclient import TestClient

from bats_core import trainers
from bats_core.api import auth
from bats_core.api.main import app
from bats_core.api.routes import me as me_routes
from bats_core.api.routes import trainers as trainers_routes

PLAYER = {"user_id": "u1", "email": "ash@liga.test", "username": "Ash", "is_admin": False}


class FakeDB:
    """get_db() simulado: guarda el UPDATE y responde el SELECT del avatar."""
    executed: list[tuple] = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=()):
        FakeDB.executed.append((sql, params))

    def fetchone(self, sql, params=()):
        return {"avatar": "red"}


class CatalogTests(unittest.TestCase):
    def test_ids_unicos_y_con_forma_de_archivo(self):
        ids = [t[0] for t in trainers.CATALOG]
        self.assertEqual(len(ids), len(set(ids)))
        # El mismo patrón que usa Showdown para los nombres de PNG: nada de rutas arbitrarias.
        for i in ids:
            self.assertRegex(i, r"^[a-z0-9-]{1,40}$")

    def test_is_valid(self):
        self.assertTrue(trainers.is_valid("red"))
        self.assertFalse(trainers.is_valid("../etc/passwd"))
        self.assertFalse(trainers.is_valid(""))


class TrainerRoutesTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_lista_el_catalogo(self):
        res = self.client.get("/api/trainers")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), len(trainers.CATALOG))
        self.assertEqual(set(res.json()[0]), {"id", "label", "category"})

    def test_imagen_del_catalogo(self):
        with mock.patch.object(trainers_routes, "_download", return_value=b"\x89PNG") as dl:
            res = self.client.get("/api/trainers/red")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers["content-type"], "image/png")
        self.assertTrue(dl.call_args.args[0].endswith("/sprites/trainers/red.png"))

    def test_fuera_del_catalogo_no_llega_a_showdown(self):
        with mock.patch.object(trainers_routes, "_download") as dl:
            res = self.client.get("/api/trainers/no-existe")
        self.assertEqual(res.status_code, 404)
        dl.assert_not_called()

    def test_showdown_caido_da_404(self):
        with mock.patch.object(trainers_routes, "_download", return_value=None):
            self.assertEqual(self.client.get("/api/trainers/red").status_code, 404)


class PatchMeTests(unittest.TestCase):
    def setUp(self):
        FakeDB.executed = []
        app.dependency_overrides[auth.require_player] = lambda: PLAYER
        self.addCleanup(app.dependency_overrides.clear)
        patcher = mock.patch.object(me_routes, "get_db", FakeDB)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)

    def test_guarda_un_sprite_valido_de_la_sesion(self):
        res = self.client.patch("/api/me", json={"avatar": "lance"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"avatar": "lance"})
        _, params = FakeDB.executed[0]
        self.assertEqual(params, ("lance", "ash@liga.test"))   # la cuenta sale de la sesión

    def test_null_quita_el_sprite(self):
        res = self.client.patch("/api/me", json={"avatar": None})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(FakeDB.executed[0][1], (None, "ash@liga.test"))

    def test_rechaza_un_sprite_fuera_del_catalogo(self):
        res = self.client.patch("/api/me", json={"avatar": "../../x"})
        self.assertEqual(res.status_code, 422)
        self.assertEqual(FakeDB.executed, [])

    def test_ignora_campos_de_identidad_del_body(self):
        res = self.client.patch("/api/me", json={"avatar": "red", "username": "otro", "email": "x@y.z"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(FakeDB.executed[0][1][1], "ash@liga.test")

    def test_get_me_incluye_avatar(self):
        res = self.client.get("/api/me")
        self.assertEqual(res.json()["avatar"], "red")


class PatchMeSinSesionTests(unittest.TestCase):
    def test_sin_token_401(self):
        self.assertEqual(TestClient(app).patch("/api/me", json={"avatar": "red"}).status_code, 401)


if __name__ == "__main__":
    unittest.main()
