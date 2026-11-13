"""
tests/test_player_pokedex.py
============================
GET /api/players/{username}/pokedex: la Pokédex pública de cada jugador.
Necesita una base DESECHABLE en BATS_TEST_DSN.
"""
import os
import unittest
import uuid
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from bats_core.api.main import app
from bats_core.db.connection import BATSDatabase

DSN = os.environ.get("BATS_TEST_DSN")
DB_DIR = Path(__file__).parent.parent / "bats_core" / "db"


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestPlayerPokedex(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        with BATSDatabase(DSN) as db:
            db.apply_schema(DB_DIR / "schema.sql")
            db.apply_migrations(DB_DIR / "migrations")

    def setUp(self):
        env = mock.patch.dict(os.environ, {"BATS_DB_DSN": DSN})
        env.start()
        self.addCleanup(env.stop)
        self.tag = uuid.uuid4().hex[:8]
        self.ana, self.sin = f"ana{self.tag}", f"sin{self.tag}"
        with BATSDatabase(DSN) as db:
            db.execute(
                "INSERT INTO tournament.player_accounts (email, username) VALUES (%s, %s)",
                (f"sin-{self.tag}@x.test", f"Sin{self.tag}"),
            )
            for species_id, species, at in (("garchomp", "Garchomp", "2026-11-02"),
                                            ("weavile", "Weavile", "2026-11-09")):
                db.execute(
                    "INSERT INTO tournament.pokedex_seen "
                    "(username, species_id, species, first_seen_at, battle_id, opponent) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (self.ana, species_id, species, at, f"b-{species_id}", "bea"),
                )
            db.commit()
        self.addCleanup(self._cleanup)
        self.client = TestClient(app, raise_server_exceptions=False)

    def _cleanup(self):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM tournament.pokedex_seen WHERE username LIKE %s", (f"%{self.tag}",))
            db.execute("DELETE FROM tournament.player_accounts WHERE email LIKE %s", (f"%{self.tag}@x.test",))
            db.commit()

    def test_devuelve_los_avistamientos_ordenados(self):
        res = self.client.get(f"/api/players/{self.ana}/pokedex")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["username"], self.ana)
        self.assertEqual([s["species_id"] for s in body["seen"]], ["weavile", "garchomp"])
        self.assertEqual(body["seen"][0], {
            "species_id": "weavile", "species": "Weavile", "first_seen_at": body["seen"][0]["first_seen_at"],
            "battle_id": "b-weavile", "opponent": "bea",
        })
        self.assertTrue(body["seen"][0]["first_seen_at"].startswith("2026-11-09"))

    def test_no_distingue_mayusculas(self):
        lower = self.client.get(f"/api/players/{self.ana}/pokedex").json()
        upper = self.client.get(f"/api/players/{self.ana.upper()}/pokedex").json()
        self.assertEqual(lower, upper)

    def test_jugador_con_cuenta_sin_avistamientos(self):
        res = self.client.get(f"/api/players/{self.sin}/pokedex")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"username": self.sin, "seen": []})

    def test_jugador_con_batallas_sin_cuenta_ni_avistamientos(self):
        """Tiene perfil público (jugó batallas) aunque el admin no le haya creado cuenta."""
        nick = f"Pelea{self.tag}"
        with BATSDatabase(DSN) as db:
            db.execute("INSERT INTO battle.dim_players (username) VALUES (%s)", (nick,))
            db.commit()
        try:
            res = self.client.get(f"/api/players/{nick.lower()}/pokedex")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json(), {"username": nick.lower(), "seen": []})
        finally:
            with BATSDatabase(DSN) as db:
                db.execute("DELETE FROM battle.dim_players WHERE username = %s", (nick,))
                db.commit()

    def test_jugador_inexistente(self):
        res = self.client.get(f"/api/players/nadie{self.tag}/pokedex")
        self.assertEqual(res.status_code, 404)
        self.assertIn("detail", res.json())

    def test_es_publica(self):
        # Sin header Authorization ni overrides de auth.
        self.assertEqual(self.client.get(f"/api/players/{self.ana}/pokedex").status_code, 200)

    def test_collectors_devuelve_cada_jugador_con_sus_avistamientos(self):
        """GET /api/stats/collectors: avistamientos crudos de cada jugador (el cliente calcula el progreso)."""
        bea = f"bea{self.tag}"
        with BATSDatabase(DSN) as db:
            db.execute(
                "INSERT INTO tournament.pokedex_seen (username, species_id, species, first_seen_at, battle_id, opponent) "
                "VALUES (%s, 'scizormega', 'Scizor-Mega', '2026-11-05', 'b-scizor', %s)", (bea, self.ana))
            db.commit()
        res = self.client.get("/api/stats/collectors")
        self.assertEqual(res.status_code, 200)
        mine = [c for c in res.json() if c["username"].endswith(self.tag)]
        self.assertEqual([c["username"] for c in mine], sorted([self.ana, bea]))
        for c in mine:
            self.assertEqual(c["seen"], self.client.get(f"/api/players/{c['username']}/pokedex").json()["seen"])
        # Con cuenta pero sin avistamientos: no aparece.
        self.assertNotIn(self.sin, [c["username"] for c in res.json()])
