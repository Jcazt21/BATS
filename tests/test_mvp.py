"""
tests/test_mvp.py
=================
La fórmula MVP vive en dos sitios que deben coincidir: bats_core/mvp.py (Python) y
battle.mvp_score() (SQL, columna generada). Los tests de DB necesitan una base
DESECHABLE en BATS_TEST_DSN.
"""
import itertools
import os
import unittest
import uuid
from pathlib import Path

from bats_core.mvp import mvp_score

DSN = os.environ.get("BATS_TEST_DSN")


class TestFormulaPython(unittest.TestCase):

    def test_ejemplos(self):
        # (2×2) + sobrevive 1 + golpe final 1 + 3 turnos × 0.25
        self.assertEqual(mvp_score(2, 3, True, True), 6.75)
        # sin KOs, muro que sobrevive 2 turnos
        self.assertEqual(mvp_score(0, 2, True, False), 1.5)

    def test_los_turnos_tienen_tope(self):
        self.assertEqual(mvp_score(0, 8, False, False), mvp_score(0, 200, False, False))

    def test_un_muro_ya_no_supera_a_diez_kos(self):
        muro = mvp_score(0, 20, True, False)
        self.assertLess(muro, mvp_score(2, 1, False, False))   # 2 KOs bastan para superarlo
        self.assertLess(muro, 10 * 2)

    def test_banca_puntua_cero(self):
        self.assertEqual(mvp_score(0, 0, True, False, was_active=False), 0.0)


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestFormulaSQL(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        from bats_core.db.connection import BATSDatabase
        cls.BATSDatabase = BATSDatabase
        db_dir = Path(__file__).parent.parent / "bats_core" / "db"
        with BATSDatabase(DSN) as db:
            db.apply_schema(db_dir / "schema.sql")
            db.apply_migrations(db_dir / "migrations")

    def test_sql_y_python_coinciden(self):
        with self.BATSDatabase(DSN) as db:
            for kills, turns, survived, final_hit in itertools.product(range(0, 5), range(0, 13), (True, False), (True, False)):
                got = db.fetchone("SELECT battle.mvp_score(%s, %s, %s, %s) AS v", (kills, turns, survived, final_hit))["v"]
                self.assertEqual(float(got), mvp_score(kills, turns, survived, final_hit), (kills, turns, survived, final_hit))

    def test_la_columna_es_generada_y_la_banca_vale_cero(self):
        tag = uuid.uuid4().hex[:8]
        with self.BATSDatabase(DSN) as db:
            gen = db.fetchone(
                "SELECT is_generated FROM information_schema.columns WHERE table_schema='battle' "
                "AND table_name='fact_pokemon_performance' AND column_name='mvp_score'")["is_generated"]
            self.assertEqual(gen, "ALWAYS")

            fmt = db.fetchone("INSERT INTO battle.dim_formats (format_name, gen) VALUES (%s, 9) RETURNING format_id", (f"f{tag}",))["format_id"]
            p1 = db.fetchone("INSERT INTO battle.dim_players (username) VALUES (%s) RETURNING player_id", (f"a{tag}",))["player_id"]
            p2 = db.fetchone("INSERT INTO battle.dim_players (username) VALUES (%s) RETURNING player_id", (f"b{tag}",))["player_id"]
            pk = db.fetchone("INSERT INTO battle.dim_pokemon (species) VALUES (%s) RETURNING pokemon_id", (f"Mon{tag}",))["pokemon_id"]
            pk2 = db.fetchone("INSERT INTO battle.dim_pokemon (species) VALUES (%s) RETURNING pokemon_id", (f"Ban{tag}",))["pokemon_id"]
            db.execute(
                "INSERT INTO battle.fact_battles (battle_id, format_id, battle_date, p1_id, p2_id, winner_id, total_turns, end_type) "
                "VALUES (%s, %s, CURRENT_DATE, %s, %s, %s, 5, 'normal')", (f"b-{tag}", fmt, p1, p2, p1))
            db.execute(
                "INSERT INTO battle.fact_pokemon_performance (battle_id, player_id, pokemon_id, kills, turns_active, survived, final_hit, was_active) "
                "VALUES (%s, %s, %s, 2, 3, TRUE, TRUE, TRUE), (%s, %s, %s, 0, 0, TRUE, FALSE, FALSE)",
                (f"b-{tag}", p1, pk, f"b-{tag}", p1, pk2))
            rows = {r["pokemon_id"]: float(r["mvp_score"]) for r in db.fetchall(
                "SELECT pokemon_id, mvp_score FROM battle.fact_pokemon_performance WHERE battle_id = %s", (f"b-{tag}",))}
            self.assertEqual(rows[pk], 6.75)
            self.assertEqual(rows[pk2], 0.0)
            # el ETL ya no puede escribirla a mano
            with self.assertRaises(Exception):
                db.execute("UPDATE battle.fact_pokemon_performance SET mvp_score = 99 WHERE battle_id = %s", (f"b-{tag}",))
        with self.BATSDatabase(DSN) as db:
            db.execute("DELETE FROM battle.fact_battles WHERE battle_id = %s", (f"b-{tag}",))
            db.execute("DELETE FROM battle.dim_pokemon WHERE species IN (%s, %s)", (f"Mon{tag}", f"Ban{tag}"))
            db.execute("DELETE FROM battle.dim_players WHERE username IN (%s, %s)", (f"a{tag}", f"b{tag}"))
            db.execute("DELETE FROM battle.dim_formats WHERE format_name = %s", (f"f{tag}",))


if __name__ == "__main__":
    unittest.main()
