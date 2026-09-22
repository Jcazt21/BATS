"""
tests/test_rules.py
===================
Motor de reglas (bats_core/rules.py): spec, normalización, validación de equipos,
GET /api/rules/active y el registro de equipos (/api/teams/me) contra una DB desechable
(BATS_TEST_DSN).
"""
import json
import os
import unittest
import uuid
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from bats_core import dex
from bats_core.api import auth
from bats_core.api.crypto import hash_username
from bats_core.api.main import app
from bats_core.db.connection import BATSDatabase
from bats_core.rules import (
    RESTRICTION_SPEC, RuleError, active_rules_payload, check_team, normalize_restrictions, rule_checklist,
    validate_restriction,
)

DSN = os.environ.get("BATS_TEST_DSN")
DEX_DIR = Path(__file__).parent.parent / "web" / "public" / "dex"


def mon(name="Mon", **kw):
    return {"name": name, "held_item": None, "color": None, "generation": None, "egg_groups": [], "types": "Normal", **kw}


class TestSpec(unittest.TestCase):

    def test_valida_por_tipo(self):
        self.assertEqual(validate_restriction("required_color", "yellow"), "yellow")
        self.assertEqual(validate_restriction("required_generation", 5), 5)
        self.assertIs(validate_restriction("item_clause", True), True)
        self.assertEqual(validate_restriction("max_paradox", 0), 0)

    def test_rechaza_invalidos(self):
        for key, value in [("required_color", "fucsia"), ("required_generation", 10), ("required_generation", True),
                           ("item_clause", "si"), ("max_paradox", 7), ("max_paradox", None), ("nope", 1)]:
            with self.subTest(key=key, value=value):
                with self.assertRaises(RuleError):
                    validate_restriction(key, value)

    def test_nullable_acepta_none(self):
        self.assertIsNone(validate_restriction("required_color", None))

    def test_normalizar_aplica_defaults(self):
        n = normalize_restrictions({})
        self.assertEqual((n["max_paradox"], n["max_pseudo_legendary"], n["item_clause"]), (1, 1, False))
        self.assertIsNone(n["required_color"])
        self.assertEqual(set(n), set(RESTRICTION_SPEC))

    def test_normalizar_ignora_claves_desconocidas_y_acepta_json_str(self):
        n = normalize_restrictions(json.dumps({"required_color": "blue", "basura": 1}))
        self.assertEqual(n["required_color"], "blue")
        self.assertNotIn("basura", n)

    def test_payload_activo(self):
        p = active_rules_payload(
            {"season_id": 3, "season_name": "T3", "type_of_month": "Ice", "restrictions": {"required_color": "yellow"}},
            ["Haxorus", "Dragapult"],
        )
        self.assertEqual(p["type_of_month"], "Ice")
        self.assertEqual(p["restrictions"]["required_color"], "yellow")
        self.assertEqual(p["bans"], ["Dragapult", "Haxorus"])


class TestCheckTeam(unittest.TestCase):
    RULES = {"required_color": "yellow", "required_generation": 5, "required_egg_group": "dragon", "item_clause": True}

    def test_equipo_valido(self):
        team = [mon("A", color="yellow"), mon("B", generation=5), mon("C", egg_groups=["dragon"], held_item="Leftovers")]
        self.assertEqual(check_team(team, self.RULES), [])

    def test_codigos_que_entiende_el_frontend(self):
        got = {v["rule"]: v["code"] for v in check_team([mon("A", held_item="X"), mon("B", held_item="X")], self.RULES)}
        self.assertEqual(got, {
            "item_clause": "item_clause:X", "required_color": "missing_color:yellow",
            "required_generation": "missing_generation:5", "required_egg_group": "missing_egg_group:dragon",
        })

    def test_el_orden_es_el_historico(self):
        self.assertEqual([v["rule"] for v in check_team([mon("A", held_item="X"), mon("B", held_item="X")], self.RULES)],
                         ["item_clause", "required_color", "required_generation", "required_egg_group"])

    def test_color_sin_distinguir_mayusculas(self):
        self.assertEqual(check_team([mon(color="Yellow")], {"required_color": "yellow"}), [])

    def test_sin_restricciones_todo_vale(self):
        self.assertEqual(check_team([mon()], {}), [])

    def test_tipo_del_mes_solo_si_se_pide(self):
        self.assertEqual(check_team([mon(types="Fire")], {}), [])                       # el registro no lo exige
        v = check_team([mon(types="Fire")], {}, type_of_month="Ice")
        self.assertEqual(v[0]["code"], "missing_type:Ice")
        self.assertEqual(check_team([mon(types="Water / Ice")], {}, type_of_month="Ice"), [])


class FakeDB:
    def __enter__(self): return self
    def __exit__(self, *e): return None
    def fetchone(self, sql, params=None):
        return {"season_id": 7, "season_name": "T7", "type_of_month": "Ice", "max_team_size": 8,
                "max_team_changes": 4, "restrictions": '{"required_color": "yellow"}'}
    def fetchall(self, sql, params=None):
        return [{"pokemon_name": "Haxorus"}]


class TestRutaPublica(unittest.TestCase):

    def test_rules_active_es_publica_y_normalizada(self):
        with mock.patch("bats_core.api.routes.rules.get_db", FakeDB):
            r = TestClient(app).get("/api/rules/active")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual((body["season_id"], body["type_of_month"], body["bans"]), (7, "Ice", ["Haxorus"]))
        self.assertEqual(body["restrictions"]["required_color"], "yellow")
        self.assertEqual(body["restrictions"]["max_paradox"], 1)


class TestReglasDelDex(unittest.TestCase):
    """Reglas que antes solo aplicaba config/formats.ts; ahora los datos vienen del dex."""

    def test_limita_paradox(self):
        team = [mon("Great Tusk", is_paradox=True), mon("Iron Treads", is_paradox=True)]
        codes = [v["code"] for v in check_team(team, {"max_paradox": 1}, lineup=True)]
        self.assertIn("max_paradox:2/1", codes)
        self.assertEqual(check_team(team, {"max_paradox": 2}, lineup=True), [])

    def test_limita_pseudo_legendarios(self):
        team = [mon("Garchomp", is_pseudo=True), mon("Dragonite", is_pseudo=True)]
        codes = [v["code"] for v in check_team(team, {"max_pseudo_legendary": 1}, lineup=True)]
        self.assertIn("max_pseudo_legendary:2/1", codes)

    def test_prohibe_ultra_beasts_y_no_legales(self):
        codes = [v["code"] for v in check_team([mon("Buzzwole", is_ultra_beast=True)], {})]
        self.assertIn("ultra_beast:Buzzwole", codes)
        codes = [v["code"] for v in check_team([mon("Zacian-Crowned", league_legal=False)], {})]
        self.assertIn("not_legal:Zacian-Crowned", codes)

    def test_un_solo_restricted(self):
        team = [mon("Koraidon", is_restricted=True), mon("Miraidon", is_restricted=True)]
        codes = [v["code"] for v in check_team(team, {}, lineup=True)]
        self.assertIn("max_restricted:2/1", codes)

    def test_el_pool_no_cuenta_los_limites_del_lineup(self):
        team = [mon("Garchomp", is_pseudo=True), mon("Dragonite", is_pseudo=True),
                mon("Great Tusk", is_paradox=True), mon("Iron Treads", is_paradox=True)]
        self.assertEqual(check_team(team, {}), [])
        rows = {r["rule"] for r in rule_checklist(team, {})}
        self.assertNotIn("max_pseudo_legendary", rows)
        self.assertNotIn("max_paradox", rows)

    def test_sin_datos_del_dex_no_hay_violaciones(self):
        self.assertEqual(check_team([mon("Garchomp")], {}), [])

    def test_checklist_incluye_las_reglas_del_dex(self):
        rows = {r["rule"]: r for r in rule_checklist([mon("Garchomp", is_pseudo=True)], {}, lineup=True)}
        self.assertTrue(rows["max_paradox"]["ok"])
        self.assertTrue(rows["max_pseudo_legendary"]["ok"])
        self.assertTrue(rows["max_restricted"]["ok"])
        self.assertIn("(1/1)", rows["max_pseudo_legendary"]["label"])

    def test_checklist_marca_el_exceso(self):
        team = [mon("Garchomp", is_pseudo=True), mon("Dragonite", is_pseudo=True)]
        rows = {r["rule"]: r for r in rule_checklist(team, {}, lineup=True)}
        self.assertFalse(rows["max_pseudo_legendary"]["ok"])
        self.assertEqual(rows["max_pseudo_legendary"]["names"], ["Garchomp", "Dragonite"])

    def test_roster_enforcement_es_una_restriccion(self):
        self.assertIn("roster_enforcement", RESTRICTION_SPEC)
        self.assertIs(normalize_restrictions({})["roster_enforcement"], False)
        self.assertIs(validate_restriction("roster_enforcement", True), True)

    def test_max_restricted_por_defecto_es_uno(self):
        self.assertEqual(normalize_restrictions({})["max_restricted"], 1)



@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestRegistroConReglas(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        db_dir = Path(__file__).parent.parent / "bats_core" / "db"
        with BATSDatabase(DSN) as db:
            db.apply_schema(db_dir / "schema.sql")
            db.apply_migrations(db_dir / "migrations")
            dex.import_snapshot(db, DEX_DIR)

    def setUp(self):
        env = mock.patch.dict(os.environ, {"BATS_DB_DSN": DSN})
        env.start()
        self.addCleanup(env.stop)
        tag = uuid.uuid4().hex[:8]
        self.username = f"jug_{tag}"
        with BATSDatabase(DSN) as db:
            db.execute("UPDATE tournament.seasons SET is_active = FALSE")
            self.season = db.fetchone(
                "INSERT INTO tournament.seasons (season_name, type_of_month, start_date, is_active, restrictions) "
                "VALUES (%s, 'Ice', CURRENT_DATE, TRUE, %s::jsonb) RETURNING season_id",
                (f"R-{tag}", json.dumps({"required_color": "yellow", "item_clause": True})))["season_id"]
            db.execute("INSERT INTO tournament.ban_whitelist (voter_hash, season_id, username) VALUES (%s, %s, %s)",
                       (hash_username(self.username), self.season, self.username))
        self.addCleanup(self._cleanup)
        app.dependency_overrides[auth.require_player] = lambda: {
            "user_id": "u", "email": "e@x.test", "username": self.username, "is_admin": False}
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app, raise_server_exceptions=False)

    def _cleanup(self):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM tournament.roster WHERE season_id = %s", (self.season,))
            db.execute("DELETE FROM tournament.seasons WHERE season_id = %s", (self.season,))

    def _register(self, *pokemon):
        return self.client.post("/api/teams/me", json={"pokemon": list(pokemon)})

    def test_rechaza_con_el_codigo_de_la_regla(self):
        r = self._register({"name": "Pikachu", "color": "yellow", "held_item": "Focus Sash"},
                           {"name": "Raichu", "color": "yellow", "held_item": "Focus Sash"})
        self.assertEqual((r.status_code, r.json()["detail"]), (422, "item_clause:Focus Sash"))
        r = self._register({"name": "Bulbasaur", "color": "green"})
        self.assertEqual((r.status_code, r.json()["detail"]), (422, "missing_color:yellow"))

    def test_no_confia_en_los_metadatos_del_cliente(self):
        """El cliente declara color amarillo; el dex dice azul: el registro se rechaza."""
        r = self._register({"name": "Garchomp", "color": "yellow", "generation": 4,
                            "egg_groups": ["dragon"], "types": "Dragon / Ground"})
        self.assertEqual((r.status_code, r.json()["detail"]), (422, "missing_color:yellow"))

    def test_una_especie_que_no_existe_se_rechaza(self):
        r = self._register({"name": "Pokemonfalso", "color": "yellow"})
        self.assertEqual((r.status_code, r.json()["detail"]), (422, "unknown_species:Pokemonfalso"))

    def test_el_limite_de_paradox_aplica_al_lineup_no_al_pool(self):
        with BATSDatabase(DSN) as db:
            db.execute("UPDATE tournament.seasons SET restrictions = %s::jsonb WHERE season_id = %s",
                       (json.dumps({"max_paradox": 1}), self.season))
        team = [{"name": "Pikachu"}, {"name": "Great Tusk"}, {"name": "Iron Treads"}]
        pool = self.client.post("/api/teams/me/validate", json={"pokemon": team}).json()
        self.assertNotIn("max_paradox", {r["rule"] for r in pool["checklist"]})
        lineup = self.client.post("/api/teams/me/validate", json={"pokemon": team, "lineup": True}).json()
        row = next(r for r in lineup["checklist"] if r["rule"] == "max_paradox")
        self.assertFalse(row["ok"])
        self.assertEqual(row["names"], ["Great Tusk", "Iron Treads"])
        self.assertEqual(self._register(*team).status_code, 200)   # el pool de 3 sí se registra

    def test_sin_dex_cargado_responde_503(self):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM tournament.dex_meta")
        self.addCleanup(self._reimportar_dex)
        r = self._register({"name": "Pikachu"})
        self.assertEqual((r.status_code, r.json()["detail"]), (503, "dex_not_loaded"))

    def _reimportar_dex(self):
        with BATSDatabase(DSN) as db:
            dex.import_snapshot(db, DEX_DIR)

    def test_registra_y_la_identidad_sale_de_la_sesion(self):
        r = self._register({"name": "Pikachu", "color": "yellow"}, {"name": "Bulbasaur", "color": "green"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["username"], self.username.lower())
        me = self.client.get("/api/teams/me").json()
        self.assertEqual([p["name"] for p in me["pool"]], ["Pikachu", "Bulbasaur"])
        self.assertEqual(self._register({"name": "Mew"}).status_code, 409)

    def test_un_equipo_rechazado_no_deja_roster_vacio(self):
        self._register({"name": "Bulbasaur", "color": "green"})
        with BATSDatabase(DSN) as db:
            n = db.fetchone("SELECT COUNT(*) AS n FROM tournament.roster WHERE season_id = %s", (self.season,))["n"]
        self.assertEqual(n, 0)

    def test_no_se_ve_el_roster_ajeno_hasta_bloquearlo(self):
        self._register({"name": "Pikachu", "color": "yellow"})
        otro = f"otro_{uuid.uuid4().hex[:6]}"
        with BATSDatabase(DSN) as db:
            db.execute("INSERT INTO tournament.ban_whitelist (voter_hash, season_id, username) VALUES (%s, %s, %s)",
                       (hash_username(otro), self.season, otro))
        app.dependency_overrides[auth.require_player] = lambda: {
            "user_id": "u2", "email": "o@x.test", "username": otro, "is_admin": False}
        self.assertEqual(self.client.get(f"/api/teams/{self.username}").status_code, 403)
        with BATSDatabase(DSN) as db:
            db.execute("UPDATE tournament.roster SET is_locked = TRUE WHERE season_id = %s", (self.season,))
        self.assertEqual(self.client.get(f"/api/teams/{self.username}").status_code, 200)



class TestBotRulesDrift(unittest.TestCase):
    """El bot no puede regenerar sus pools solo, pero avisa si la temporada ya exige otro tipo."""

    def _with_rules(self, content):
        import tempfile
        from bats_core.bot import config
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        tmp.write(content)
        tmp.close()
        self.addCleanup(os.unlink, tmp.name)
        return mock.patch.object(config, "ACTIVE_RULES_FILE", Path(tmp.name)), config

    def test_sin_archivo_no_avisa(self):
        from bats_core.bot import config
        with mock.patch.object(config, "ACTIVE_RULES_FILE", Path("/no/existe/active_rules.json")):
            self.assertIsNone(config.rules_drift())

    def test_mismo_tipo_no_avisa(self):
        patch, config = self._with_rules(json.dumps({"type_of_month": config_type()}))
        with patch:
            self.assertIsNone(config.rules_drift())

    def test_otro_tipo_avisa(self):
        patch, config = self._with_rules(json.dumps({"type_of_month": "Fire"}))
        with patch:
            self.assertIn("Fire", config.rules_drift())

    def test_archivo_corrupto_no_rompe_el_bot(self):
        patch, config = self._with_rules("{no es json")
        with patch:
            self.assertIsNone(config.rules_drift())


def config_type():
    from bats_core.bot.config import TYPE_OF_MONTH
    return TYPE_OF_MONTH.lower()


if __name__ == "__main__":
    unittest.main()
