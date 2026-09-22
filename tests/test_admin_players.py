"""
tests/test_admin_players.py
============================
CRUD de /api/admin/players: alta, edición, enlace/desenlace del login de
Supabase y la cascada del rename sobre tournament.roster/bans/ban_whitelist/
ban_participation. Necesita una base DESECHABLE en BATS_TEST_DSN.
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
class TestAdminPlayers(unittest.TestCase):

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
        self.season = None
        with BATSDatabase(DSN) as db:
            self.admin_id = db.fetchone(
                "INSERT INTO tournament.player_accounts (email, username, is_admin) "
                "VALUES (%s, %s, TRUE) RETURNING account_id",
                (f"admin-{self.tag}@x.test", f"Admin{self.tag}"),
            )["account_id"]
        self.addCleanup(self._cleanup)
        app.dependency_overrides[auth.require_admin] = lambda: {
            "user_id": "u-admin", "email": f"admin-{self.tag}@x.test", "username": f"Admin{self.tag}", "is_admin": True,
        }
        self.client = TestClient(app, raise_server_exceptions=False)

    def _cleanup(self):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM tournament.player_accounts WHERE email LIKE %s", (f"%{self.tag}@x.test",))
            if self.season:
                # roster/bans son ON DELETE RESTRICT hacia seasons: hay que vaciarlos
                # primero o el DELETE de la temporada aborta TODA la transacción
                # (incluido el DELETE de player_accounts de arriba).
                db.execute("DELETE FROM tournament.roster WHERE season_id = %s", (self.season,))
                db.execute("DELETE FROM tournament.bans WHERE season_id = %s", (self.season,))
                db.execute("DELETE FROM tournament.seasons WHERE season_id = %s", (self.season,))
        app.dependency_overrides.clear()

    def _add(self, email=None, username=None, is_admin=False, user_id=None):
        return self.client.post("/api/admin/players", json={
            "email": email or f"p-{uuid.uuid4().hex[:6]}-{self.tag}@x.test",
            "username": username or f"u{uuid.uuid4().hex[:6]}",
            "is_admin": is_admin, "user_id": user_id,
        })

    def _season(self):
        if self.season is None:
            with BATSDatabase(DSN) as db:
                db.execute("UPDATE tournament.seasons SET is_active = FALSE")
                self.season = db.fetchone(
                    "INSERT INTO tournament.seasons (season_name, type_of_month, start_date, is_active) "
                    "VALUES (%s, 'Ice', CURRENT_DATE, TRUE) RETURNING season_id",
                    (f"T-{self.tag}",),
                )["season_id"]
        return self.season

    def _seed_username_data(self, username: str):
        """Roster + ban + whitelist + participación para `username` en una temporada."""
        season = self._season()
        with BATSDatabase(DSN) as db:
            db.execute("INSERT INTO tournament.roster (season_id, username) VALUES (%s, %s)", (season, username))
            pokemon_id = db.fetchone(
                "INSERT INTO tournament.pokemon_cache (name) VALUES (%s) RETURNING pokemon_id",
                (f"Testmon-{uuid.uuid4().hex[:6]}",),
            )["pokemon_id"]
            db.execute(
                "INSERT INTO tournament.bans (season_id, player_username, pokemon_id) VALUES (%s, %s, %s)",
                (season, username.lower(), pokemon_id),
            )
            h = hash_username(username)
            db.execute(
                "INSERT INTO tournament.ban_whitelist (voter_hash, season_id, username) VALUES (%s, %s, %s)",
                (h, season, username.lower()),
            )
            db.execute(
                "INSERT INTO tournament.ban_participation (voter_hash, season_id) VALUES (%s, %s)", (h, season))
        return season

    # ── POST / DELETE (huecos del CRUD que no tenían test) ────────────────────

    def test_alta_basica(self):
        res = self._add(is_admin=False)
        self.assertEqual(res.status_code, 201)
        self.assertIsNone(res.json()["user_id"])

    def test_alta_con_user_id_ya_enlazada(self):
        uid = str(uuid.uuid4())
        res = self._add(user_id=uid)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["user_id"], uid)

    def test_alta_duplicada_por_email_o_username(self):
        dup_email = f"dup-{self.tag}@x.test"
        res = self._add(email=dup_email, username=f"Dup1{self.tag}")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self._add(email=dup_email, username="Otro").status_code, 409)
        self.assertEqual(self._add(email=f"otro2-{self.tag}@x.test", username=f"Dup1{self.tag}").status_code, 409)

    def test_borrar_cuenta_inexistente(self):
        self.assertEqual(self.client.delete("/api/admin/players/999999").status_code, 404)

    def test_no_puede_borrarse_a_si_mismo(self):
        self.assertEqual(self.client.delete(f"/api/admin/players/{self.admin_id}").status_code, 409)

    def test_no_puede_borrar_al_ultimo_admin(self):
        # self.admin_id es el único admin (la cuenta que representa a "me" no cuenta
        # como "otro admin" para sí misma, pero aquí probamos borrar a OTRO admin
        # cuando es el último).
        other_admin = self._add(is_admin=True).json()["account_id"]
        with BATSDatabase(DSN) as db:
            db.execute("UPDATE tournament.player_accounts SET is_admin = FALSE WHERE account_id = %s", (self.admin_id,))
        res = self.client.delete(f"/api/admin/players/{other_admin}")
        self.assertEqual(res.status_code, 409)
        with BATSDatabase(DSN) as db:
            db.execute("UPDATE tournament.player_accounts SET is_admin = TRUE WHERE account_id = %s", (self.admin_id,))

    # ── PATCH: validaciones básicas ────────────────────────────────────────────

    def test_patch_cuenta_inexistente(self):
        self.assertEqual(self.client.patch("/api/admin/players/999999", json={"is_admin": True}).status_code, 404)

    def test_patch_sin_campos(self):
        acc = self._add().json()["account_id"]
        self.assertEqual(self.client.patch(f"/api/admin/players/{acc}", json={}).status_code, 422)

    def test_patch_enlazar_y_desenlazar_a_la_vez(self):
        acc = self._add().json()["account_id"]
        res = self.client.patch(f"/api/admin/players/{acc}",
                                 json={"link_user_id": str(uuid.uuid4()), "clear_user_id": True})
        self.assertEqual(res.status_code, 422)

    def test_patch_cambia_email_y_username(self):
        acc = self._add().json()["account_id"]
        new_email = f"nuevo-{self.tag}@x.test"
        res = self.client.patch(f"/api/admin/players/{acc}", json={"email": new_email, "username": "NuevoNombre"})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["email"], new_email)
        self.assertEqual(body["username"], "NuevoNombre")

    def test_patch_email_duplicado(self):
        ocupado = f"ocupado-{self.tag}@x.test"
        self._add(email=ocupado)
        acc = self._add().json()["account_id"]
        self.assertEqual(self.client.patch(f"/api/admin/players/{acc}", json={"email": ocupado}).status_code, 409)

    def test_patch_username_duplicado(self):
        ocupado = f"Ocupado{self.tag}"
        self._add(username=ocupado)
        acc = self._add().json()["account_id"]
        self.assertEqual(self.client.patch(f"/api/admin/players/{acc}", json={"username": ocupado}).status_code, 409)

    # ── Bug 1: cambiar el email desenlaza (nunca deja un user_id viejo con email nuevo) ──

    def test_cambiar_email_desenlaza(self):
        uid = str(uuid.uuid4())
        acc = self._add(user_id=uid).json()["account_id"]
        res = self.client.patch(f"/api/admin/players/{acc}", json={"email": f"otro-correo-{self.tag}@x.test"})
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.json()["user_id"])
        self.assertTrue(res.json()["user_id_cleared"])

    def test_cambiar_email_con_link_user_id_no_desenlaza(self):
        """Enlazar un login huérfano: se cambia el email Y se enlaza en la misma llamada."""
        acc = self._add().json()["account_id"]
        uid = str(uuid.uuid4())
        res = self.client.patch(f"/api/admin/players/{acc}",
                                 json={"email": f"login-{self.tag}@x.test", "link_user_id": uid})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["user_id"], uid)
        self.assertFalse(res.json()["user_id_cleared"])

    # ── Bug 2: link_user_id ya usado por otra cuenta -> 409, no 500 ────────────

    def test_link_user_id_ya_enlazado_a_otra_cuenta(self):
        uid = str(uuid.uuid4())
        self._add(user_id=uid, username="Dueño")
        acc = self._add().json()["account_id"]
        res = self.client.patch(f"/api/admin/players/{acc}", json={"link_user_id": uid})
        self.assertEqual(res.status_code, 409)
        self.assertIn("Dueño", res.json()["detail"])

    # ── Desenlazar y re-enlazar ─────────────────────────────────────────────

    def test_desenlazar_y_reenlazar(self):
        uid = str(uuid.uuid4())
        acc = self._add(user_id=uid).json()["account_id"]
        res = self.client.patch(f"/api/admin/players/{acc}", json={"clear_user_id": True})
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.json()["user_id"])
        uid2 = str(uuid.uuid4())
        res = self.client.patch(f"/api/admin/players/{acc}", json={"link_user_id": uid2})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["user_id"], uid2)

    # ── Bug 4: guardrails de admin ──────────────────────────────────────────

    def test_no_puede_quitarse_a_si_mismo_el_admin(self):
        res = self.client.patch(f"/api/admin/players/{self.admin_id}", json={"is_admin": False})
        self.assertEqual(res.status_code, 409)

    def test_no_puede_degradar_al_ultimo_admin(self):
        other_admin = self._add(is_admin=True).json()["account_id"]
        with BATSDatabase(DSN) as db:
            db.execute("UPDATE tournament.player_accounts SET is_admin = FALSE WHERE account_id = %s", (self.admin_id,))
        res = self.client.patch(f"/api/admin/players/{other_admin}", json={"is_admin": False})
        self.assertEqual(res.status_code, 409)
        with BATSDatabase(DSN) as db:
            db.execute("UPDATE tournament.player_accounts SET is_admin = TRUE WHERE account_id = %s", (self.admin_id,))

    # ── Cascada del rename ────────────────────────────────────────────────────

    def test_cascada_del_rename(self):
        old, new = f"viejo{self.tag}", f"nuevo{self.tag}"
        acc = self._add(username=old).json()["account_id"]
        season = self._seed_username_data(old)

        res = self.client.patch(f"/api/admin/players/{acc}", json={"username": new})
        self.assertEqual(res.status_code, 200)
        cascade = res.json()["cascade"]
        self.assertEqual(cascade, {"roster": 1, "bans": 1, "whitelist": 1, "participation": 1})

        with BATSDatabase(DSN) as db:
            self.assertEqual(
                db.fetchone("SELECT username FROM tournament.roster WHERE season_id = %s", (season,))["username"],
                new.lower())
            self.assertEqual(
                db.fetchone("SELECT player_username FROM tournament.bans WHERE season_id = %s", (season,))["player_username"],
                new.lower())
            new_hash, old_hash = hash_username(new), hash_username(old)
            self.assertIsNotNone(db.fetchone(
                "SELECT 1 FROM tournament.ban_whitelist WHERE voter_hash = %s AND season_id = %s", (new_hash, season)))
            self.assertIsNone(db.fetchone(
                "SELECT 1 FROM tournament.ban_whitelist WHERE voter_hash = %s AND season_id = %s", (old_hash, season)))
            self.assertIsNotNone(db.fetchone(
                "SELECT 1 FROM tournament.ban_participation WHERE voter_hash = %s AND season_id = %s", (new_hash, season)))
            self.assertIsNone(db.fetchone(
                "SELECT 1 FROM tournament.ban_participation WHERE voter_hash = %s AND season_id = %s", (old_hash, season)))

    def test_rename_sin_datos_no_hace_cascada(self):
        acc = self._add(username=f"solo{self.tag}").json()["account_id"]
        res = self.client.patch(f"/api/admin/players/{acc}", json={"username": f"solonuevo{self.tag}"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["cascade"], {"roster": 0, "bans": 0, "whitelist": 0, "participation": 0})

    def test_rename_con_colision_no_mueve_nada(self):
        """Si el nombre nuevo ya tiene equipo en la misma temporada, se aborta entero."""
        season = self._season()
        old, clash = f"origen{self.tag}", f"choque{self.tag}"
        acc = self._add(username=old).json()["account_id"]
        with BATSDatabase(DSN) as db:
            db.execute("INSERT INTO tournament.roster (season_id, username) VALUES (%s, %s)", (season, old.lower()))
            db.execute("INSERT INTO tournament.roster (season_id, username) VALUES (%s, %s)", (season, clash.lower()))

        res = self.client.patch(f"/api/admin/players/{acc}", json={"username": clash})
        self.assertEqual(res.status_code, 409)

        with BATSDatabase(DSN) as db:
            row = db.fetchone("SELECT username FROM tournament.player_accounts WHERE account_id = %s", (acc,))
            self.assertEqual(row["username"], old)  # no se movió nada, ni siquiera el propio nombre

    # ── Logins de Supabase (degradación en local) ──────────────────────────────

    def test_auth_logins_no_disponible_en_local(self):
        res = self.client.get("/api/admin/auth-logins")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"available": False, "logins": []})
        # la transacción no debe quedar abortada para lo que venga después
        self.assertEqual(self.client.get("/api/admin/players").status_code, 200)


if __name__ == "__main__":
    unittest.main()
