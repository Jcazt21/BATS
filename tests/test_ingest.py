"""
tests/test_ingest.py
====================
Tests de la ingesta por push (Vercel + Supabase): parser sin filesystem,
endpoints /api/ingest/battle y /api/cron/refresh-views, y el comando backfill.

Ejecutar con: python -m pytest tests/test_ingest.py -v

Casi todo corre sin base de datos. La clase TestIngestDB solo corre si defines
BATS_TEST_DSN apuntando a una base DESECHABLE (crea el schema y deja filas de
dimensión de prueba):

    createdb bats_test
    BATS_TEST_DSN=postgresql://localhost/bats_test python -m pytest tests/test_ingest.py -v
"""
import json
import os
import tempfile
import threading
import unittest
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from bats_core.backfill import backfill
from bats_core.parser import parse_battle_dict, parse_battle_file
from test_bats import SAMPLE_BATTLE_JSON

BATTLE_ID = "gen9pinchesgueysleague-7"
FORMAT = "gen9pinchesgueysleague"
DATE = "2026-03-19"


def _body(**overrides) -> dict:
    body = {"battle_id": BATTLE_ID, "format": FORMAT, "date": DATE, "log": SAMPLE_BATTLE_JSON}
    body.update(overrides)
    return body


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─── Parser sin filesystem ────────────────────────────────────────────────────

class TestParseBattleDict(unittest.TestCase):

    def test_equivale_al_parser_de_archivo(self):
        """Mismo BattleData por archivo (metadatos desde la ruta) que por payload (explícitos)."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "2026-03" / FORMAT / DATE / f"{BATTLE_ID}.log.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(SAMPLE_BATTLE_JSON), encoding="utf-8")
            from_file = parse_battle_file(path)

        from_dict = parse_battle_dict(SAMPLE_BATTLE_JSON, BATTLE_ID, DATE, FORMAT)
        self.assertIsNotNone(from_dict)
        self.assertEqual(from_file, from_dict)

    def test_usa_los_metadatos_recibidos(self):
        b = parse_battle_dict(SAMPLE_BATTLE_JSON, "x-1", "2030-01-02", "gen9ou")
        self.assertEqual((b.battle_id, b.date, b.format), ("x-1", "2030-01-02", "gen9ou"))

    def test_rechaza_contenido_invalido(self):
        for bad in (None, [], "texto", 42):
            self.assertIsNone(parse_battle_dict(bad, "x-1", DATE, FORMAT), repr(bad))

    def test_rechaza_campos_faltantes(self):
        for missing in ("p1", "p2", "winner", "turns", "log"):
            data = {k: v for k, v in SAMPLE_BATTLE_JSON.items() if k != missing}
            self.assertIsNone(parse_battle_dict(data, "x-1", DATE, FORMAT), missing)

    def test_ignora_batallas_de_prueba(self):
        self.assertIsNone(parse_battle_dict({**SAMPLE_BATTLE_JSON, "turns": 2}, "x-1", DATE, FORMAT))


# ─── Endpoints ────────────────────────────────────────────────────────────────

class TestIngestEndpoint(unittest.TestCase):

    def setUp(self):
        from api.index import app  # entrypoint de Vercel: valida también que importe
        self.client = TestClient(app, raise_server_exceptions=False)
        env = mock.patch.dict(os.environ, {"BATS_INGEST_TOKEN": "tok-ingest", "CRON_SECRET": "tok-cron"})
        env.start()
        self.addCleanup(env.stop)

    def _no_db(self):
        """get_db que falla si se usa: prueba que la ruta no abrió conexión."""
        def boom():
            raise AssertionError("no debía abrirse una conexión a la DB")
        return mock.patch("bats_core.api.routes.ingest.get_db", boom)

    # -- autenticación

    def test_exige_token(self):
        with self._no_db():
            r = self.client.post("/api/ingest/battle", json=_body())
        self.assertIn(r.status_code, (401, 403))

    def test_rechaza_token_incorrecto(self):
        with self._no_db():
            r = self.client.post("/api/ingest/battle", json=_body(), headers=_bearer("malo"))
        self.assertEqual(r.status_code, 401)

    def test_el_token_del_cron_no_sirve_para_ingesta(self):
        with self._no_db():
            r = self.client.post("/api/ingest/battle", json=_body(), headers=_bearer("tok-cron"))
        self.assertEqual(r.status_code, 401)

    def test_falla_cerrado_si_el_token_no_esta_configurado(self):
        with mock.patch.dict(os.environ):
            os.environ.pop("BATS_INGEST_TOKEN")
            with self._no_db():
                r = self.client.post("/api/ingest/battle", json=_body(), headers=_bearer("cualquiera"))
        self.assertEqual(r.status_code, 503)

    # -- validación

    def test_valida_el_formato_de_los_campos(self):
        for bad in (
            {"battle_id": "../etc/passwd"},
            {"battle_id": "x" * 81},          # VARCHAR(80)
            {"battle_id": "MAYUS-1"},
            {"format": "gen 9"},
            {"date": "19/03/2026"},
        ):
            with self._no_db():
                r = self.client.post("/api/ingest/battle", json=_body(**bad), headers=_bearer("tok-ingest"))
            self.assertEqual(r.status_code, 422, bad)

    def test_log_invalido_es_ignored_sin_abrir_la_db(self):
        for log in ({"p1": "a"}, {**SAMPLE_BATTLE_JSON, "turns": 2}):
            with self._no_db():
                r = self.client.post("/api/ingest/battle", json=_body(log=log), headers=_bearer("tok-ingest"))
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["status"], "ignored")

    # -- carga

    def test_batalla_valida_se_carga(self):
        @contextmanager
        def fake_db():
            yield object()

        with mock.patch("bats_core.api.routes.ingest.get_db", fake_db), \
                mock.patch("bats_core.api.routes.ingest.load_pushed", return_value="loaded") as load:
            r = self.client.post("/api/ingest/battle", json=_body(), headers=_bearer("tok-ingest"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"status": "loaded", "battle_id": BATTLE_ID})
        battle = load.call_args.args[1]
        self.assertEqual((battle.battle_id, battle.format, battle.date), (BATTLE_ID, FORMAT, DATE))

    def test_error_de_db_responde_500_generico(self):
        @contextmanager
        def broken_db():
            raise RuntimeError("password authentication failed for user 'postgres'")
            yield  # pragma: no cover

        with mock.patch("bats_core.api.routes.ingest.get_db", broken_db):
            r = self.client.post("/api/ingest/battle", json=_body(), headers=_bearer("tok-ingest"))
        self.assertEqual(r.status_code, 500)
        self.assertNotIn("password", r.text)   # no filtra el detalle interno
        self.assertEqual(r.json()["detail"], "Error interno del servidor.")

    # -- cron

    def test_cron_exige_su_propio_secreto(self):
        with self._no_db():
            self.assertEqual(self.client.get("/api/cron/refresh-views", headers=_bearer("malo")).status_code, 401)
            self.assertEqual(self.client.get("/api/cron/refresh-views", headers=_bearer("tok-ingest")).status_code, 401)

    def test_refresh_desde_ps_usa_el_token_de_ingesta(self):
        """El plugin de PS pide el refresh con su token de ingesta (no con el del cron)."""
        executed = []

        class FakeDB:
            def execute(self, sql, params=None):
                executed.append(sql)

        @contextmanager
        def fake_db():
            yield FakeDB()

        with self._no_db():
            self.assertIn(self.client.post("/api/ingest/refresh-views").status_code, (401, 403))
            self.assertEqual(
                self.client.post("/api/ingest/refresh-views", headers=_bearer("tok-cron")).status_code, 401)
        with mock.patch("bats_core.api.routes.ingest.get_db", fake_db):
            r = self.client.post("/api/ingest/refresh-views", headers=_bearer("tok-ingest"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(executed, ["SELECT battle.refresh_bats_views_concurrently()"])

    def test_cron_refresca_vistas_sin_bloquear(self):
        executed = []

        class FakeDB:
            def execute(self, sql, params=None):
                executed.append(sql)

        @contextmanager
        def fake_db():
            yield FakeDB()

        with mock.patch("bats_core.api.routes.ingest.get_db", fake_db):
            r = self.client.get("/api/cron/refresh-views", headers=_bearer("tok-cron"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(executed, ["SELECT battle.refresh_bats_views_concurrently()"])


class TestApiSinDependenciasPesadas(unittest.TestCase):

    def test_la_api_no_importa_pandas(self):
        """pandas (~100MB) no debe entrar al bundle de la función serverless."""
        import subprocess
        import sys
        code = "import sys; sys.path.insert(0, '.'); import api.index; sys.exit(int('pandas' in sys.modules))"
        r = subprocess.run([sys.executable, "-c", code], cwd=Path(__file__).parent.parent)
        self.assertEqual(r.returncode, 0, "api.index importó pandas")


# ─── Backfill ─────────────────────────────────────────────────────────────────

class _Handler(BaseHTTPRequestHandler):
    requests: list = []
    status_code = 200
    reply = {"status": "loaded"}

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        type(self).requests.append({
            "path": self.path,
            "auth": self.headers.get("Authorization"),
            "body": json.loads(body),
        })
        self.send_response(type(self).status_code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(type(self).reply).encode())

    def log_message(self, *args):
        pass


class TestBackfill(unittest.TestCase):

    def setUp(self):
        _Handler.requests = []
        _Handler.status_code = 200
        _Handler.reply = {"status": "loaded"}
        self.server = HTTPServer(("127.0.0.1", 0), _Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.shutdown)
        self.url = f"http://127.0.0.1:{self.server.server_port}"

        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.logs = Path(self.tmp.name)
        for fmt, bid in ((FORMAT, BATTLE_ID), ("gen9pglsparring", "gen9pglsparring-3")):
            p = self.logs / "2026-03" / fmt / DATE / f"{bid}.log.json"
            p.parent.mkdir(parents=True)
            p.write_text(json.dumps(SAMPLE_BATTLE_JSON), encoding="utf-8")

    def test_envia_cada_log_con_metadatos_de_la_ruta(self):
        stats = backfill(self.logs, self.url, "tok", log=lambda _: None)
        self.assertEqual((stats["total"], stats["loaded"], stats["failed"]), (2, 2, 0))
        sent = {r["body"]["battle_id"]: r for r in _Handler.requests}
        self.assertEqual(set(sent), {BATTLE_ID, "gen9pglsparring-3"})
        r = sent[BATTLE_ID]
        self.assertEqual(r["path"], "/api/ingest/battle")
        self.assertEqual(r["auth"], "Bearer tok")
        self.assertEqual((r["body"]["format"], r["body"]["date"]), (FORMAT, DATE))
        self.assertEqual(r["body"]["log"]["p1"], "Ash")

    def test_filtra_por_formato(self):
        stats = backfill(self.logs, self.url, "tok", fmt="gen9pglsparring", log=lambda _: None)
        self.assertEqual(stats["total"], 1)
        self.assertEqual(_Handler.requests[0]["body"]["format"], "gen9pglsparring")

    def test_cuenta_omitidas(self):
        _Handler.reply = {"status": "skipped"}
        stats = backfill(self.logs, self.url, "tok", log=lambda _: None)
        self.assertEqual((stats["skipped"], stats["loaded"]), (2, 0))

    def test_dry_run_no_envia(self):
        stats = backfill(self.logs, self.url, "tok", dry_run=True, log=lambda _: None)
        self.assertEqual(_Handler.requests, [])
        self.assertEqual(stats["total"], 2)

    def test_401_es_fallo_y_no_se_reintenta(self):
        _Handler.status_code = 401
        stats = backfill(self.logs, self.url, "malo", log=lambda _: None)
        self.assertEqual(stats["failed"], 2)
        self.assertEqual(len(_Handler.requests), 2)   # un intento por log
        self.assertIn("401", stats["failures"][0]["reason"])

    def test_log_ilegible_es_fallo_y_sigue_con_los_demas(self):
        (self.logs / "2026-03" / FORMAT / DATE / "roto-1.log.json").write_text("{no es json", encoding="utf-8")
        stats = backfill(self.logs, self.url, "tok", log=lambda _: None)
        self.assertEqual((stats["total"], stats["loaded"], stats["failed"]), (3, 2, 1))

    def test_carpeta_inexistente(self):
        with self.assertRaises(FileNotFoundError):
            backfill(self.logs / "no-existe", self.url, "tok", log=lambda _: None)


# ─── Integración con base de datos (opcional) ─────────────────────────────────

@unittest.skipUnless(os.environ.get("BATS_TEST_DSN"), "define BATS_TEST_DSN (base DESECHABLE) para correr estos tests")
class TestIngestDB(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        from bats_core.db.connection import BATSDatabase
        cls.BATSDatabase = BATSDatabase
        cls.dsn = os.environ["BATS_TEST_DSN"]
        db_dir = Path(__file__).parent.parent / "bats_core" / "db"
        with BATSDatabase(cls.dsn) as db:
            db.apply_schema(db_dir / "schema.sql")
            db.apply_migrations(db_dir / "migrations")
            db.execute("SELECT battle.refresh_bats_views_concurrently()")

    def setUp(self):
        self.battle_id = f"gen9test-{uuid.uuid4().hex[:8]}"
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        with self.BATSDatabase(self.dsn) as db:
            db.execute("DELETE FROM battle.fact_battles WHERE battle_id = %s", (self.battle_id,))
            db.execute("DELETE FROM battle.etl_log WHERE battle_id = %s", (self.battle_id,))

    def _ingest(self) -> str:
        from bats_core.db.etl import ingest_payload
        with self.BATSDatabase(self.dsn) as db:
            return ingest_payload(db, SAMPLE_BATTLE_JSON, self.battle_id, DATE, "gen9test")

    def _count(self, sql: str) -> int:
        with self.BATSDatabase(self.dsn) as db:
            return int(db.fetchone(sql, (self.battle_id,))["n"])

    def test_carga_una_vez_y_es_idempotente(self):
        self.assertEqual(self._ingest(), "loaded")
        self.assertEqual(self._ingest(), "skipped")
        self.assertEqual(self._count("SELECT COUNT(*) AS n FROM battle.fact_battles WHERE battle_id = %s"), 1)
        self.assertEqual(self._count("SELECT COUNT(*) AS n FROM battle.etl_log WHERE battle_id = %s"), 1)
        self.assertGreater(
            self._count("SELECT COUNT(*) AS n FROM battle.fact_pokemon_performance WHERE battle_id = %s"), 0
        )

    def test_dedupe_por_battle_id_entre_push_y_archivo(self):
        """Una batalla ya ingerida por push no se recarga si luego llega desde disco."""
        from bats_core.db.etl import BATSEtl
        self.assertEqual(self._ingest(), "loaded")
        battle = parse_battle_dict(SAMPLE_BATTLE_JSON, self.battle_id, DATE, "gen9test")
        with self.BATSDatabase(self.dsn) as db:
            self.assertFalse(BATSEtl(db).load_battle(battle, "/ruta/absoluta/vieja/x.log.json"))

    def test_ban_votes_no_referencia_al_votante(self):
        """Invariante de anonimato: ninguna columna de ban_votes identifica al votante."""
        with self.BATSDatabase(self.dsn) as db:
            cols = [r["column_name"] for r in db.fetchall(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'tournament' AND table_name = 'ban_votes'"
            )]
        self.assertFalse([c for c in cols if "user" in c or "voter" in c], cols)


@unittest.skipUnless(os.environ.get("BATS_TEST_DSN"), "define BATS_TEST_DSN (base DESECHABLE) para correr estos tests")
class TestRosterValidation(unittest.TestCase):
    """Veredictos asíncronos del TeamValidator real de Showdown."""

    @classmethod
    def setUpClass(cls):
        from bats_core.db.connection import BATSDatabase

        cls.BATSDatabase = BATSDatabase
        cls.dsn = os.environ["BATS_TEST_DSN"]
        db_dir = Path(__file__).parent.parent / "bats_core" / "db"
        with BATSDatabase(cls.dsn) as db:
            db.apply_schema(db_dir / "schema.sql")
            db.apply_migrations(db_dir / "migrations")

    def setUp(self):
        from bats_core.api import auth
        from bats_core.api.main import app
        from bats_core.api.crypto import hash_username

        self.auth = auth
        self.app = app
        self.username = "PGL_Tester"
        self.tag = uuid.uuid4().hex[:8]
        self.env = mock.patch.dict(os.environ, {
            "BATS_DB_DSN": self.dsn,
            "BATS_INGEST_TOKEN": "tok-ingest",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

        with self.BATSDatabase(self.dsn) as db:
            db.execute("UPDATE tournament.seasons SET is_active = FALSE")
            self.season_id = db.fetchone(
                """INSERT INTO tournament.seasons
                       (season_name, type_of_month, start_date, is_active, restrictions)
                   VALUES (%s, 'Ice', '2034-01-01', TRUE, '{}'::jsonb)
                   RETURNING season_id""",
                (f"Validation-{self.tag}",),
            )["season_id"]
            db.execute(
                "INSERT INTO tournament.ban_whitelist (voter_hash, season_id, username) VALUES (%s, %s, %s)",
                (hash_username(self.username), self.season_id, self.username),
            )
            self.roster_id = db.fetchone(
                "INSERT INTO tournament.roster (season_id, username) VALUES (%s, %s) RETURNING roster_id",
                (self.season_id, self.username),
            )["roster_id"]

        app.dependency_overrides[auth.require_player] = lambda: {
            "user_id": "u", "email": "tester@example.test",
            "username": self.username, "is_admin": False,
        }
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app, raise_server_exceptions=False)
        self.ingest_headers = _bearer("tok-ingest")
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        with self.BATSDatabase(self.dsn) as db:
            db.execute("DELETE FROM tournament.roster WHERE season_id = %s", (self.season_id,))
            db.execute("DELETE FROM tournament.ban_whitelist WHERE season_id = %s", (self.season_id,))
            db.execute("DELETE FROM tournament.seasons WHERE season_id = %s", (self.season_id,))

    def test_guarda_el_veredicto_del_validador(self):
        response = self.client.post(
            "/api/ingest/roster-validation",
            headers=self.ingest_headers,
            json={
                "ps_commit": "abc1234",
                "results": {"pgl_tester": ["Garchomp no aprende Psychic."]},
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "updated": 1})
        validation = self.client.get("/api/teams/me").json()["validation"]
        self.assertEqual(validation["state"], "errors")
        self.assertEqual(validation["errors"], ["Garchomp no aprende Psychic."])
        self.assertIsNotNone(validation["checked_at"])
        with self.BATSDatabase(self.dsn) as db:
            row = db.fetchone(
                "SELECT validated_commit FROM tournament.roster WHERE roster_id = %s",
                (self.roster_id,),
            )
        self.assertEqual(row["validated_commit"], "abc1234")

    def test_lista_vacia_significa_equipo_valido(self):
        self.client.post(
            "/api/ingest/roster-validation",
            headers=self.ingest_headers,
            json={"ps_commit": "abc1234", "results": {"PGL_Tester": []}},
        )
        validation = self.client.get("/api/teams/me").json()["validation"]
        self.assertEqual(validation["state"], "ok")
        self.assertEqual(validation["errors"], [])

    def test_sin_veredicto_queda_pendiente(self):
        validation = self.client.get("/api/teams/me").json()["validation"]
        self.assertEqual(validation, {"state": "pending", "errors": [], "checked_at": None})

    def test_exige_token(self):
        response = self.client.post("/api/ingest/roster-validation", json={"results": {}})
        self.assertEqual(response.status_code, 401)

    def test_ignora_jugadores_sin_roster(self):
        response = self.client.post(
            "/api/ingest/roster-validation",
            headers=self.ingest_headers,
            json={"results": {"nadie": ["x"]}},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "updated": 0})


if __name__ == "__main__":
    unittest.main()
