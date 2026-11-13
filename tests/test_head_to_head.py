"""
tests/test_head_to_head.py
==========================
GET /api/stats/head-to-head: historial directo entre dos jugadores (V-D-E, últimas batallas y el
pokémon con más KOs de cada uno en esos duelos).

Requiere una base DESECHABLE en BATS_TEST_DSN.
"""
import json
import os
import unittest
import uuid
from collections import Counter
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from bats_core.api.main import app
from bats_core.db.connection import BATSDatabase
from bats_core.db.etl import ingest_payload
from test_bats import SAMPLE_BATTLE_JSON

DSN = os.environ.get("BATS_TEST_DSN")


def _battle(p1: str, p2: str, winner: str) -> dict:
    """SAMPLE_BATTLE_JSON con Ash → p1 y Gary → p2 (el log solo nombra al ganador en |win|)."""
    data = json.loads(json.dumps(SAMPLE_BATTLE_JSON).replace("Ash", "\0p1").replace("Gary", "\0p2")
                      .replace("\0p1", p1).replace("\0p2", p2))
    data["winner"] = winner
    return data


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestHeadToHead(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        db_dir = Path(__file__).parent.parent / "bats_core" / "db"
        with BATSDatabase(DSN) as db:
            db.apply_schema(db_dir / "schema.sql")
            db.apply_migrations(db_dir / "migrations")

        tag = uuid.uuid4().hex[:6]
        cls.a, cls.b, cls.c = f"Hha{tag}", f"Hhb{tag}", f"Hhc{tag}"
        cls.battle_ids: list[str] = []
        with BATSDatabase(DSN) as db:
            cls.season_a = db.fetchone(
                "INSERT INTO tournament.seasons (season_name, type_of_month, start_date, end_date) "
                "VALUES (%s, 'Ice', '2033-01-01', '2033-01-31') RETURNING season_id", (f"H2H-A-{tag}",))["season_id"]
            cls.season_b = db.fetchone(
                "INSERT INTO tournament.seasons (season_name, type_of_month, start_date, end_date) "
                "VALUES (%s, 'Ice', '2033-02-01', '2033-02-28') RETURNING season_id", (f"H2H-B-{tag}",))["season_id"]
            a, b, c = cls.a, cls.b, cls.c
            # Temporada A: a gana 3, b gana 1, 1 empate. b es p1 en dos de ellas.
            plan = [
                ("2033-01-05", a, b, a), ("2033-01-06", b, a, b), ("2033-01-07", a, b, a),
                ("2033-01-08", b, a, a), ("2033-01-09", a, b, ""),
                ("2033-02-05", a, b, b),          # temporada B
                ("2033-01-10", a, c, a),          # a contra otro jugador: no cuenta
            ]
            for n, (date, p1, p2, winner) in enumerate(plan):
                bid = f"gen9h2h-{tag}-{n}"
                assert ingest_payload(db, _battle(p1, p2, winner), bid, date, "gen9h2h") == "loaded"
                cls.battle_ids.append(bid)

    @classmethod
    def tearDownClass(cls):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM battle.fact_battles WHERE battle_id = ANY(%s)", (cls.battle_ids,))
            db.execute("DELETE FROM battle.etl_log WHERE battle_id = ANY(%s)", (cls.battle_ids,))
            db.execute("DELETE FROM tournament.seasons WHERE season_id = ANY(%s)", ([cls.season_a, cls.season_b],))

    def setUp(self):
        env = mock.patch.dict(os.environ, {"BATS_DB_DSN": DSN})
        env.start()
        self.addCleanup(env.stop)
        self.client = TestClient(app)

    def _get(self, a, b, **params):
        return self.client.get("/api/stats/head-to-head", params={"a": a, "b": b, **params})

    def test_historial_y_orden(self):
        got = self._get(self.a, self.b, season_id=self.season_a).json()
        self.assertEqual((got["a"], got["b"]), (self.a.lower(), self.b.lower()))
        self.assertEqual((got["wins_a"], got["wins_b"], got["ties"]), (3, 1, 1))
        self.assertEqual([x["date"][:10] for x in got["battles"]],
                         ["2033-01-09", "2033-01-08", "2033-01-07", "2033-01-06", "2033-01-05"])
        self.assertEqual([x["winner"] for x in got["battles"]],
                         [None, self.a.lower(), self.a.lower(), self.b.lower(), self.a.lower()])
        self.assertTrue(all(x["turns"] == 4 for x in got["battles"]))

    def test_sin_temporada_suma_todas(self):
        got = self._get(self.a, self.b).json()
        self.assertEqual((got["wins_a"], got["wins_b"], got["ties"]), (3, 2, 1))

    def test_simetria(self):
        got = self._get(self.b, self.a, season_id=self.season_a).json()
        self.assertEqual((got["wins_a"], got["wins_b"], got["ties"]), (1, 3, 1))

    def test_mayusculas(self):
        self.assertEqual(self._get(self.a.upper(), self.b, season_id=self.season_a).json(),
                         self._get(self.a.lower(), self.b.lower(), season_id=self.season_a).json())

    def test_mismo_jugador_400(self):
        r = self._get(self.a, self.a.upper())
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"], "Elige dos jugadores distintos.")

    def test_jugador_inexistente_404(self):
        r = self._get(self.a, "nadie-con-este-nombre")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json()["detail"], "Jugador no encontrado.")

    def test_sin_enfrentamientos(self):
        got = self._get(self.b, self.c).json()
        self.assertEqual((got["wins_a"], got["wins_b"], got["ties"]), (0, 0, 0))
        self.assertEqual(got["battles"], [])
        self.assertEqual(got["top_killer"], {"a": None, "b": None})

    def test_limit(self):
        got = self._get(self.a, self.b, season_id=self.season_a, limit=2).json()
        self.assertEqual(len(got["battles"]), 2)
        self.assertEqual((got["wins_a"], got["wins_b"], got["ties"]), (3, 1, 1))
        self.assertEqual(self._get(self.a, self.b, limit=0).status_code, 422)

    def test_top_killer(self):
        ids = self.battle_ids[:5]
        with BATSDatabase(DSN) as db:
            rows = db.fetchall(
                """
                SELECT LOWER(dpl.username) AS username, dp.species, fpp.kills
                FROM battle.fact_pokemon_performance fpp
                JOIN battle.dim_players dpl ON dpl.player_id = fpp.player_id
                JOIN battle.dim_pokemon dp ON dp.pokemon_id = fpp.pokemon_id
                WHERE fpp.battle_id = ANY(%s) AND fpp.was_active
                """, (ids,))
        exp = {}
        for side, user in (("a", self.a.lower()), ("b", self.b.lower())):
            kills = Counter()
            for r in rows:
                if r["username"] == user:
                    kills[r["species"]] += r["kills"]
            best = sorted(((-k, s) for s, k in kills.items() if k > 0))
            exp[side] = {"species": best[0][1], "kills": -best[0][0]} if best else None
        got = self._get(self.a, self.b, season_id=self.season_a).json()
        self.assertEqual(got["top_killer"], exp)
        self.assertIsNotNone(exp["a"])


if __name__ == "__main__":
    unittest.main()
