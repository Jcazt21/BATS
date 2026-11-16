"""
tests/test_arena_flags.py
=========================
Invariante I12 de Arena: con BATS_ARENA_MODE=off (o ausente, o con un valor
desconocido) las rutas de arena responden 404; `admins` deja pasar solo a los
administradores; `all` a cualquier jugador. No necesita base de datos.
"""
import os
import unittest
from unittest import mock

from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient

from bats_core.api import auth
from bats_core.arena import flags


def _app() -> FastAPI:
    """App mínima con la misma puerta que llevará /api/arena/* (las rutas reales llegan en la fase 3)."""
    router = APIRouter(prefix="/api/arena", dependencies=[Depends(flags.arena_enabled)])

    @router.get("/config")
    def config(player: dict = Depends(flags.require_arena_player)):
        return {"username": player["username"]}

    app = FastAPI()
    app.include_router(router)
    return app


def _player(is_admin: bool) -> dict:
    return {"user_id": "u-1", "email": "x@x.test", "username": "alguien", "is_admin": is_admin}


class TestArenaMode(unittest.TestCase):

    def _mode(self, value):
        env = {} if value is None else {"BATS_ARENA_MODE": value}
        with mock.patch.dict(os.environ, env):
            if value is None:
                os.environ.pop("BATS_ARENA_MODE", None)
            return flags.arena_mode()

    def test_ausente_es_off(self):
        self.assertEqual(self._mode(None), "off")

    def test_valores_validos(self):
        for value in ("off", "admins", "all"):
            self.assertEqual(self._mode(value), value)

    def test_tolera_espacios_y_mayusculas(self):
        self.assertEqual(self._mode(" Admins "), "admins")

    def test_valor_desconocido_es_off(self):
        for value in ("", "true", "1", "todos"):
            self.assertEqual(self._mode(value), "off")

    def test_arena_allows(self):
        self.assertFalse(flags.arena_allows("off", True))
        self.assertTrue(flags.arena_allows("admins", True))
        self.assertFalse(flags.arena_allows("admins", False))
        self.assertTrue(flags.arena_allows("all", False))


class TestArenaGate(unittest.TestCase):

    def setUp(self):
        self.app = _app()
        self.client = TestClient(self.app)

    def _get(self, mode, player=None):
        if player is not None:
            self.app.dependency_overrides[auth.require_player] = lambda: player
        with mock.patch.dict(os.environ, {"BATS_ARENA_MODE": mode}):
            return self.client.get("/api/arena/config")

    def test_off_responde_404_aunque_seas_admin(self):
        self.assertEqual(self._get("off", _player(True)).status_code, 404)

    def test_off_responde_404_antes_de_mirar_la_sesion(self):
        # Sin token y sin BATS_SUPABASE_URL: si la auth corriera primero daría 401 o 503.
        self.assertEqual(self._get("off").status_code, 404)

    def test_valor_desconocido_responde_404(self):
        self.assertEqual(self._get("activado", _player(True)).status_code, 404)

    def test_admins_deja_pasar_al_admin(self):
        res = self._get("admins", _player(True))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"username": "alguien"})

    def test_admins_responde_404_al_jugador(self):
        self.assertEqual(self._get("admins", _player(False)).status_code, 404)

    def test_admins_sin_sesion_pide_autenticarse(self):
        self.assertEqual(self._get("admins").status_code, 401)

    def test_all_deja_pasar_a_cualquier_jugador(self):
        self.assertEqual(self._get("all", _player(False)).status_code, 200)


if __name__ == "__main__":
    unittest.main()
