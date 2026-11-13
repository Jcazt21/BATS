"""
tests/test_stats_views.py
=========================
/api/stats/{mvp,pickrate,leaderboard,summary} leen SIEMPRE las vistas materializadas.
Aquí se comprueba que sus números coinciden con un oráculo independiente calculado
en Python desde las tablas base, con y sin ?season_id=, con dos temporadas y dos
formatos (el caso en que agregar filas de la vista podía desviarse).

Requiere una base DESECHABLE en BATS_TEST_DSN.
"""
import copy
import os
import unittest
import uuid
from collections import defaultdict
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from bats_core.api.main import app
from bats_core.db.connection import BATSDatabase
from bats_core.db.etl import ingest_payload
from test_bats import SAMPLE_BATTLE_JSON

DSN = os.environ.get("BATS_TEST_DSN")


def _near(a, b):
    return abs(float(a) - float(b)) < 0.006


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestStatsDesdeVistas(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        db_dir = Path(__file__).parent.parent / "bats_core" / "db"
        with BATSDatabase(DSN) as db:
            db.apply_schema(db_dir / "schema.sql")
            db.apply_migrations(db_dir / "migrations")

        cls.tag = uuid.uuid4().hex[:6]
        cls.battle_ids: list[str] = []
        cls.season_ids: list[int] = []
        # (temporada, formato, fecha, ganador) — Ash gana 5 de 8; distintas especies por formato no,
        # pero sí distinto número de batallas por (temporada, formato).
        plan = [
            (0, "gen9testa", "2031-01-05", "Ash"), (0, "gen9testa", "2031-01-06", "Ash"),
            (0, "gen9testa", "2031-01-07", "Gary"), (0, "gen9testb", "2031-01-08", "Ash"),
            (1, "gen9testa", "2031-02-05", "Gary"), (1, "gen9testb", "2031-02-06", "Ash"),
            (1, "gen9testb", "2031-02-07", "Gary"), (1, "gen9testb", "2031-02-08", "Ash"),
        ]
        with BATSDatabase(DSN) as db:
            for i, (start, end) in enumerate([("2031-01-01", "2031-01-31"), ("2031-02-01", "2031-02-28")]):
                cls.season_ids.append(db.fetchone(
                    "INSERT INTO tournament.seasons (season_name, type_of_month, start_date, end_date) "
                    "VALUES (%s, 'Ice', %s, %s) RETURNING season_id", (f"S{i}-{cls.tag}", start, end))["season_id"])
            for n, (_, fmt, date, winner) in enumerate(plan):
                bid = f"{fmt}-{cls.tag}-{n}"
                data = copy.deepcopy(SAMPLE_BATTLE_JSON)
                data["winner"] = winner
                assert ingest_payload(db, data, bid, date, fmt) == "loaded"
                cls.battle_ids.append(bid)
            db.execute("SELECT battle.refresh_bats_views_concurrently()")

    @classmethod
    def tearDownClass(cls):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM battle.fact_battles WHERE battle_id = ANY(%s)", (cls.battle_ids,))
            db.execute("DELETE FROM battle.etl_log WHERE battle_id = ANY(%s)", (cls.battle_ids,))
            db.execute("DELETE FROM tournament.seasons WHERE season_id = ANY(%s)", (cls.season_ids,))

    def setUp(self):
        env = mock.patch.dict(os.environ, {"BATS_DB_DSN": DSN})
        env.start()
        self.addCleanup(env.stop)
        self.client = TestClient(app)

    # ── Oráculo: se calcula en Python desde las tablas base ───────────────────

    def _raw(self, season_id):
        """Filas crudas (batallas humanas y filas de rendimiento) de una temporada (None = todas)."""
        with BATSDatabase(DSN) as db:
            battles = db.fetchall(
                """
                SELECT fb.battle_id, COALESCE(fb.season_id, 0) AS season_id, fb.winner_id, fb.p1_id, fb.p2_id
                FROM battle.fact_battles fb
                JOIN battle.dim_players a ON a.player_id = fb.p1_id
                JOIN battle.dim_players b ON b.player_id = fb.p2_id
                WHERE NOT fb.is_bot_battle AND NOT a.is_bot AND NOT b.is_bot
                """)
            perf = db.fetchall(
                """
                SELECT fpp.battle_id, fpp.player_id, dpl.username, dp.species, fpp.kills, fpp.survived,
                       fpp.final_hit, fpp.was_active, fpp.mvp_score
                FROM battle.fact_pokemon_performance fpp
                JOIN battle.dim_players dpl ON dpl.player_id = fpp.player_id
                JOIN battle.dim_pokemon dp ON dp.pokemon_id = fpp.pokemon_id
                WHERE NOT dpl.is_bot
                """)
            users = {r["player_id"]: r["username"] for r in db.fetchall("SELECT player_id, username FROM battle.dim_players")}
        keep = {b["battle_id"]: b for b in battles if season_id is None or b["season_id"] == season_id}
        return keep, [p for p in perf if p["battle_id"] in keep], users

    def _oracle_pickrate(self, season_id):
        battles, perf, _ = self._raw(season_id)
        slots = 2 * len(battles)
        agg = defaultdict(lambda: {"n": 0, "wins": 0, "kills": 0.0, "mvp": 0.0})
        for p in perf:
            if not p["was_active"]:
                continue
            a = agg[p["species"]]
            a["n"] += 1
            a["wins"] += battles[p["battle_id"]]["winner_id"] == p["player_id"]
            a["kills"] += p["kills"]
            a["mvp"] += float(p["mvp_score"])
        return slots, {s: {"battles_used": a["n"], "usage_pct": 100 * a["n"] / slots,
                           "avg_kills": a["kills"] / a["n"], "avg_mvp_score": a["mvp"] / a["n"],
                           "win_rate_pct": 100 * a["wins"] / a["n"]} for s, a in agg.items()}

    # ── Tests ─────────────────────────────────────────────────────────────────

    def _seasons(self):
        return [None, *self.season_ids]

    def test_pickrate(self):
        for sid in self._seasons():
            with self.subTest(season=sid):
                slots, oracle = self._oracle_pickrate(sid)
                rows = self.client.get("/api/stats/pickrate", params={"season_id": sid} if sid else {}).json()
                self.assertEqual(len(rows), min(20, len(oracle)))
                for r in rows:
                    o = oracle[r["species"]]
                    self.assertEqual(int(r["total_slots"]), slots)
                    self.assertEqual(int(r["battles_used"]), o["battles_used"], r["species"])
                    for k in ("usage_pct", "avg_kills", "avg_mvp_score", "win_rate_pct"):
                        self.assertTrue(_near(r[k], o[k]), (r["species"], k, r[k], o[k]))

    def test_leaderboard(self):
        for sid in self._seasons():
            with self.subTest(season=sid):
                battles, perf, users = self._raw(sid)
                exp = defaultdict(lambda: {"battles": 0, "wins": 0, "surv": 0})
                for b in battles.values():
                    for pid in (b["p1_id"], b["p2_id"]):
                        e = exp[users[pid]]
                        e["battles"] += 1
                        e["wins"] += b["winner_id"] == pid
                for p in perf:
                    if p["survived"]:
                        exp[p["username"]]["surv"] += 1   # cuenta también la banca (comportamiento histórico)
                rows = {r["username"]: r for r in self.client.get(
                    "/api/stats/leaderboard", params={"season_id": sid} if sid else {}).json()}
                self.assertEqual(set(rows), {u for u, e in exp.items() if e["battles"]})
                for u, r in rows.items():
                    e = exp[u]
                    self.assertEqual(int(r["total_battles"]), e["battles"], u)
                    self.assertEqual(int(r["wins"]), e["wins"], u)
                    self.assertEqual(int(r["losses"]), e["battles"] - e["wins"], u)
                    self.assertEqual(int(r["total_survivors"]), e["surv"], u)
                    self.assertTrue(_near(r["win_rate_pct"], 100 * e["wins"] / e["battles"]), u)

    def test_mvp_top5(self):
        for sid in self._seasons():
            with self.subTest(season=sid):
                battles, perf, _ = self._raw(sid)
                exp = defaultdict(lambda: {"mvp": 0.0, "kills": 0, "final": 0, "n": 0})
                for p in perf:
                    if not p["was_active"]:
                        continue
                    e = exp[(p["species"], p["username"])]
                    e["mvp"] += float(p["mvp_score"]); e["kills"] += p["kills"]
                    e["final"] += int(p["final_hit"]); e["n"] += 1
                rows = self.client.get("/api/stats/mvp", params={"season_id": sid} if sid else {}).json()
                self.assertEqual(len(rows), min(5, len(exp)))
                self.assertEqual([round(float(r["total_mvp_score"]), 2) for r in rows],
                                 sorted((round(e["mvp"], 2) for e in exp.values()), reverse=True)[:5])
                for r in rows:
                    e = exp[(r["species"], r["player"])]
                    self.assertTrue(_near(r["total_mvp_score"], e["mvp"]))
                    self.assertEqual(int(r["total_kills"]), e["kills"])
                    self.assertEqual(int(r["final_hits"]), e["final"])
                    self.assertEqual(int(r["battles_played"]), e["n"])

    def test_summary_top_win_rate(self):
        for sid in self._seasons():
            with self.subTest(season=sid):
                battles, _, users = self._raw(sid)
                exp = defaultdict(lambda: [0, 0])
                for b in battles.values():
                    for pid in (b["p1_id"], b["p2_id"]):
                        exp[users[pid]][0] += 1
                        exp[users[pid]][1] += b["winner_id"] == pid
                best = max((100 * w / n for n, w in exp.values() if n >= 3), default=0)
                got = self.client.get("/api/stats/summary", params={"season_id": sid} if sid else {}).json()["top_win_rate"]
                self.assertTrue(abs(got - round(best, 1)) < 0.06, (got, best))

    def test_recent_battles(self):
        """Feed del inicio: de más reciente a más antigua, con ganador y perdedor, filtrable por temporada."""
        rows = self.client.get("/api/stats/recent-battles",
                               params={"season_id": self.season_ids[1], "limit": 10}).json()
        self.assertEqual(len(rows), 4)
        self.assertEqual([r["date"][:10] for r in rows], ["2031-02-08", "2031-02-07", "2031-02-06", "2031-02-05"])
        for r in rows:
            self.assertIn(r["winner"], ("Ash", "Gary"))
            self.assertNotEqual(r["winner"], r["loser"])
            self.assertEqual(sorted(r["players"]), sorted([r["winner"], r["loser"]]))
        self.assertEqual(len(self.client.get("/api/stats/recent-battles", params={"limit": 2}).json()), 2)
        self.assertEqual(self.client.get("/api/stats/recent-battles", params={"limit": 0}).status_code, 422)

    def test_battles_per_day(self):
        """Curva del inicio: ventana contigua que termina en la última batalla, con acumulado y comparación de 7 días."""
        got = self.client.get("/api/stats/battles-per-day",
                              params={"season_id": self.season_ids[1], "days": 7}).json()
        self.assertEqual([d["date"][:10] for d in got["days"]],
                         [f"2031-02-{n:02d}" for n in range(2, 9)])
        self.assertEqual([d["battles"] for d in got["days"]], [0, 0, 0, 1, 1, 1, 1])
        self.assertEqual([d["total"] for d in got["days"]], [0, 0, 0, 1, 2, 3, 4])
        self.assertEqual((got["last_7"], got["prev_7"]), (4, 0))
        # Sin filtro, el acumulado arrastra las batallas anteriores a la ventana (8 en total).
        todo = self.client.get("/api/stats/battles-per-day", params={"days": 7}).json()
        self.assertEqual(todo["days"][-1]["total"] - todo["days"][0]["total"] + todo["days"][0]["battles"], 4)
        self.assertGreaterEqual(todo["days"][-1]["total"], 8)
        self.assertEqual(self.client.get("/api/stats/battles-per-day", params={"days": 3}).status_code, 422)
        # Temporada sin batallas: serie vacía, no error.
        with BATSDatabase(DSN) as db:
            vacia = db.fetchone(
                "INSERT INTO tournament.seasons (season_name, type_of_month, start_date) VALUES (%s, 'Ice', '2031-03-01') "
                "RETURNING season_id", (f"Vacia-{self.tag}",))["season_id"]
        self.season_ids.append(vacia)
        self.assertEqual(self.client.get("/api/stats/battles-per-day", params={"season_id": vacia}).json(),
                         {"days": [], "last_7": 0, "prev_7": 0})

    def test_perfil_trae_insignias(self):
        """Ash gana 5 de 8: ya tiene la primera victoria; ninguna racha de 5."""
        prof = self.client.get("/api/players/Ash").json()
        badges = {b["id"]: b for b in prof["badges"]}
        self.assertEqual([b["id"] for b in prof["badges"]], ["first_win", "streak_3", "mvp", "streak_5"])
        self.assertTrue(badges["first_win"]["earned"])
        self.assertFalse(badges["streak_5"]["earned"])

    def test_ya_no_recalcula_sobre_tablas_base(self):
        """Las rutas de métricas leen la vista: ninguna query nombra fact_pokemon_performance."""
        import inspect
        from bats_core.api.routes import stats
        for fn in (stats.get_mvp_top5, stats.get_pickrate, stats.get_leaderboard):
            self.assertNotIn("fact_pokemon_performance", inspect.getsource(fn), fn.__name__)


if __name__ == "__main__":
    unittest.main()
