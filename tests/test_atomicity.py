"""
tests/test_atomicity.py
=======================
Un bloque `with get_db()` es UNA transacción: si algo falla a mitad de camino no
queda nada a medias (voto sin participación, cero temporadas activas...).

Requiere una base DESECHABLE en BATS_TEST_DSN (se le aplica el schema):

    createdb bats_test
    BATS_TEST_DSN=postgresql://localhost/bats_test python -m pytest tests/test_atomicity.py -v
"""
import os
import unittest
import uuid
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from bats_core.api import auth
from bats_core.api.crypto import hash_username
from bats_core.api.main import app
from bats_core.db.connection import BATSDatabase

DSN = os.environ.get("BATS_TEST_DSN")


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestAtomicidad(unittest.TestCase):

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
        self.username = f"jugador_{self.tag}"
        with BATSDatabase(DSN) as db:
            db.execute("UPDATE tournament.seasons SET is_active = FALSE")
            self.season = db.fetchone(
                "INSERT INTO tournament.seasons (season_name, type_of_month, start_date, is_active) "
                "VALUES (%s, 'Ice', CURRENT_DATE, TRUE) RETURNING season_id",
                (f"T-{self.tag}",),
            )["season_id"]
            db.execute(
                "INSERT INTO tournament.ban_whitelist (voter_hash, season_id, username) VALUES (%s, %s, %s)",
                (hash_username(self.username), self.season, self.username),
            )
        self.addCleanup(self._cleanup)
        app.dependency_overrides[auth.require_player] = lambda: {
            "user_id": "u", "email": "e@x.test", "username": self.username, "is_admin": False,
        }
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app, raise_server_exceptions=False)

    def _cleanup(self):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM tournament.seasons WHERE season_id = %s", (self.season,))

    def _count(self, sql: str, *params) -> int:
        with BATSDatabase(DSN) as db:
            return int(db.fetchone(sql, params)["n"])

    def test_bloque_con_excepcion_no_deja_nada(self):
        with self.assertRaises(RuntimeError):
            with BATSDatabase(DSN) as db:
                db.execute("INSERT INTO tournament.bans (season_id, player_username, pokemon_id) "
                           "SELECT %s, 'x', pokemon_id FROM tournament.pokemon_cache LIMIT 0", (self.season,))
                db.execute("UPDATE tournament.seasons SET type_of_month = 'Fire' WHERE season_id = %s", (self.season,))
                raise RuntimeError("falla a mitad de camino")
        self.assertEqual(
            self._count("SELECT COUNT(*) AS n FROM tournament.seasons WHERE season_id = %s AND type_of_month = 'Ice'",
                        self.season), 1)

    def test_voto_sin_participacion_no_queda_huerfano(self):
        real_execute = BATSDatabase.execute

        def falla_en_participacion(db, sql, params=None):
            if "INSERT INTO tournament.ban_participation" in sql:
                raise RuntimeError("falla simulada al registrar la participación")
            return real_execute(db, sql, params)

        with mock.patch.object(BATSDatabase, "execute", falla_en_participacion):
            r = self.client.post("/api/ban/submit", json={"pokemon_name": f"Testmon{self.tag}"})
        self.assertEqual(r.status_code, 500)
        self.assertEqual(
            self._count("SELECT COUNT(*) AS n FROM tournament.ban_votes WHERE season_id = %s", self.season), 0,
            "el voto no debe sobrevivir si falló la participación",
        )
        # y el jugador todavía puede votar
        self.assertEqual(self.client.post("/api/ban/submit", json={"pokemon_name": f"Testmon{self.tag}"}).status_code, 200)
        self.assertEqual(
            self._count("SELECT COUNT(*) AS n FROM tournament.ban_votes WHERE season_id = %s", self.season), 1)

    def test_activar_temporada_no_deja_cero_activas(self):
        app.dependency_overrides[auth.require_admin] = lambda: {"username": "adm", "is_admin": True, "email": "a@x.test"}
        self.addCleanup(app.dependency_overrides.pop, auth.require_admin, None)
        with BATSDatabase(DSN) as db:
            otra = db.fetchone(
                "INSERT INTO tournament.seasons (season_name, type_of_month, start_date) "
                "VALUES (%s, 'Fire', CURRENT_DATE) RETURNING season_id", (f"O-{self.tag}",))["season_id"]
        self.addCleanup(lambda: self._delete_season(otra))
        real_execute = BATSDatabase.execute

        def falla_al_activar(db, sql, params=None):
            if "SET is_active = TRUE" in sql:
                raise RuntimeError("falla simulada")
            return real_execute(db, sql, params)

        with mock.patch.object(BATSDatabase, "execute", falla_al_activar):
            r = self.client.patch(f"/api/admin/seasons/{otra}/activate")
        self.assertEqual(r.status_code, 500)
        self.assertEqual(
            self._count("SELECT COUNT(*) AS n FROM tournament.seasons WHERE is_active = TRUE AND season_id = %s",
                        self.season), 1,
            "la temporada que estaba activa debe seguir activa",
        )

    def _delete_season(self, season_id: int):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM tournament.seasons WHERE season_id = %s", (season_id,))


if __name__ == "__main__":
    unittest.main()
