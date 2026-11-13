"""
tests/test_features.py
======================
Perfil de jugador, Pokédex de la liga, Ban Radar, checklist del teambuilder, historial
de rotaciones (que escribe el ETL) y registro cerrado. Necesitan una base DESECHABLE
en BATS_TEST_DSN.
"""
import copy
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
from bats_core.db.etl import ingest_payload
from test_bats import SAMPLE_BATTLE_JSON

DSN = os.environ.get("BATS_TEST_DSN")
DEX_DIR = Path(__file__).parent.parent / "web" / "public" / "dex"
POOL = ["Garchomp", "Clefable", "Rotom-Wash", "Heatran", "Corviknight", "Dragapult", "Gyarados", "Pikachu"]


def _mon(name, **kw):
    return {"name": name, "types": "Normal", **kw}


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestFeatures(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        db_dir = Path(__file__).parent.parent / "bats_core" / "db"
        with BATSDatabase(DSN) as db:
            db.apply_schema(db_dir / "schema.sql")
            db.apply_migrations(db_dir / "migrations")
            dex.import_snapshot(db, DEX_DIR)

    def setUp(self):
        env = mock.patch.dict(os.environ, {
            "BATS_DB_DSN": DSN,
            "BATS_INGEST_TOKEN": "test-ingest-token",
        })
        env.start()
        self.addCleanup(env.stop)
        self.tag = uuid.uuid4().hex[:6]
        self.battle_ids: list[str] = []
        with BATSDatabase(DSN) as db:
            db.execute("UPDATE tournament.seasons SET is_active = FALSE")
            self.season = db.fetchone(
                "INSERT INTO tournament.seasons (season_name, type_of_month, start_date, end_date, is_active, restrictions) "
                "VALUES (%s, 'Ice', '2032-01-01', '2032-12-31', TRUE, %s::jsonb) RETURNING season_id",
                (f"F-{self.tag}", json.dumps({"required_color": "yellow"})))["season_id"]
            for u in ("Ash", "Gary"):
                db.execute("INSERT INTO tournament.ban_whitelist (voter_hash, season_id, username) VALUES (%s, %s, %s)",
                           (hash_username(u), self.season, u))
        self.addCleanup(self._cleanup)
        self.who = "Ash"
        app.dependency_overrides[auth.require_player] = lambda: {
            "user_id": "u", "email": f"{self.who.lower()}@x.test", "username": self.who, "is_admin": False}
        app.dependency_overrides[auth.require_admin] = lambda: {
            "user_id": "adm", "email": "admin@x.test", "username": "Admin", "is_admin": True}
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app, raise_server_exceptions=False)
        self.ingest_headers = {"Authorization": "Bearer test-ingest-token"}

    def _cleanup(self):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM battle.fact_battles WHERE battle_id = ANY(%s)", (self.battle_ids,))
            db.execute("DELETE FROM battle.etl_log WHERE battle_id = ANY(%s)", (self.battle_ids,))
            db.execute("DELETE FROM tournament.roster WHERE season_id = %s", (self.season,))
            db.execute("DELETE FROM tournament.seasons WHERE season_id = %s", (self.season,))

    def _battle(self, n, winner="Ash", date="2032-01-10", p1team=None):
        data = copy.deepcopy(SAMPLE_BATTLE_JSON)
        data["winner"] = winner
        if p1team:
            data["p1team"] = [{"species": s} for s in p1team]
        bid = f"gen9feat-{self.tag}-{n}"
        with BATSDatabase(DSN) as db:
            self.assertEqual(ingest_payload(db, data, bid, date, "gen9feat"), "loaded")
            db.execute("SELECT battle.refresh_bats_views_concurrently()")
        self.battle_ids.append(bid)
        return bid

    def _register(self, who="Ash", pokemon=None, **kw):
        self.who = who
        pokemon = pokemon or [_mon(n, color="yellow", moves=["Earthquake", "Outrage"], held_item=f"Item{n}",
                                   ability="Rough Skin", nature="Jolly", tera_type="Dragon") for n in POOL]
        return self.client.post("/api/teams/me", json={"pokemon": pokemon})

    def _set_restrictions(self, **restrictions):
        with BATSDatabase(DSN) as db:
            db.execute("UPDATE tournament.seasons SET restrictions = restrictions || %s::jsonb WHERE season_id = %s",
                       (json.dumps(restrictions), self.season))

    # ── Perfil de jugador ─────────────────────────────────────────────────────

    def test_perfil_de_jugador(self):
        for n, w in enumerate(["Ash", "Ash", "Gary", "Ash"]):
            self._battle(n, w, date=f"2032-01-{10 + n}")
        r = self.client.get("/api/players/ash", params={"season_id": self.season})   # sin distinguir mayúsculas
        self.assertEqual(r.status_code, 200)
        p = r.json()
        self.assertEqual(p["username"], "Ash")
        self.assertEqual((p["record"]["battles"], p["record"]["wins"], p["record"]["losses"]), (4, 3, 1))
        self.assertEqual(p["record"]["win_rate_pct"], 75.0)
        self.assertEqual(p["streak"], {"type": "win", "length": 1})       # ganó la última tras perder la anterior
        self.assertEqual(len(p["recent"]), 4)
        self.assertEqual([g["won"] for g in p["recent"]], [True, False, True, True])   # más reciente primero
        self.assertEqual(p["recent"][0]["opponent"], "Gary")
        self.assertGreater(p["mvp"]["total"], 0)
        self.assertTrue(p["top_pokemon"] and p["top_pokemon"][0]["uses"] == 4)
        self.assertIsNone(p["roster"])

    def test_perfil_inexistente_o_bot(self):
        self.assertEqual(self.client.get("/api/players/nadie_existe").status_code, 404)
        self.assertEqual(self.client.get("/api/players/PGL-Bot").status_code, 404)

    def test_el_roster_del_perfil_solo_aparece_con_el_registro_cerrado(self):
        self._battle(0)
        self.assertEqual(self._register().status_code, 200)
        self.assertIsNone(self.client.get("/api/players/Ash").json()["roster"])
        self._set_restrictions(registration_closed=True)
        roster = self.client.get("/api/players/Ash").json()["roster"]
        self.assertEqual({m["name"] for m in roster["pool"]}, set(POOL))
        self.assertEqual(roster["pool"][0]["moves"], ["Earthquake", "Outrage"])

    # ── Registro cerrado ──────────────────────────────────────────────────────

    def test_registro_cerrado_bloquea_ediciones_y_publica_equipos(self):
        self.assertEqual(self._register().status_code, 200)
        self.who = "Gary"
        self.assertEqual(self.client.get("/api/teams/ash").status_code, 403)       # aún privado
        self._set_restrictions(registration_closed=True)
        self.who = "Ash"
        pid = self.client.get("/api/teams/me").json()["pool"][0]["pokemon_id"]
        for r in (self.client.delete(f"/api/teams/me/pokemon/{pid}"),
                  self.client.post("/api/teams/me/pokemon", json={"pokemon": [_mon("Mew")]}),
                  self._register("Gary")):
            self.assertEqual((r.status_code, r.json()["detail"]), (409, "registration_closed"))
        self.who = "Gary"
        self.assertEqual(self.client.get("/api/teams/ash").status_code, 200)       # ahora público

    # ── Estadísticas por pokémon ──────────────────────────────────────────────

    def test_pokedex_pick_vs_bring(self):
        self._battle(0, p1team=[*(["Garchomp", "Clefable", "Rotom-Wash", "Heatran", "Corviknight"]), "Gyarados"])
        r = self.client.get("/api/stats/pokemon", params={"season_id": self.season}).json()
        self.assertEqual(r["total_slots"], 2)
        by = {s["species"]: s for s in r["species"]}
        self.assertIn("Garchomp", by)
        for s in by.values():
            self.assertGreaterEqual(s["brought"], s["used"])
            self.assertGreaterEqual(s["bring_pct"], s["pick_pct"])
        # un pokémon llevado pero que no llegó a salir: bring rate sin pick rate
        gy = self.client.get("/api/stats/pokemon/gyarados", params={"season_id": self.season}).json()
        self.assertEqual((gy["used"], gy["brought"]), (0, 1))
        self.assertEqual((gy["pick_pct"], gy["bring_pct"]), (0.0, 50.0))
        self.assertEqual(self.client.get("/api/stats/pokemon/no-existe-en-la-liga").status_code, 404)

    def test_supervivencia_por_especie(self):
        """survival_pct = veces que terminó vivo / veces que salió al campo (was_active), en lista y ficha."""
        self._battle(0)
        self._battle(1, winner="Gary", date="2032-01-11")
        with BATSDatabase(DSN) as db:
            rows = db.fetchall(
                """
                SELECT dp.species, COUNT(*) AS n, SUM(fpp.survived::INT) AS vivo
                FROM battle.fact_pokemon_performance fpp
                JOIN battle.dim_pokemon dp ON dp.pokemon_id = fpp.pokemon_id
                WHERE fpp.battle_id = ANY(%s) AND fpp.was_active
                GROUP BY dp.species
                """, (self.battle_ids,))
        exp = {r["species"]: round(100 * int(r["vivo"]) / int(r["n"]), 2) for r in rows}
        lista = {s["species"]: s for s in self.client.get(
            "/api/stats/pokemon", params={"season_id": self.season}).json()["species"]}
        for species, pct in exp.items():
            self.assertEqual(lista[species]["survival_pct"], pct, species)
        # La ficha da lo mismo aunque se pida con otra grafía (especie con forma).
        forma = next(s for s in exp if "-" in s) if any("-" in s for s in exp) else next(iter(exp))
        ficha = self.client.get(f"/api/stats/pokemon/{forma.upper().replace('-', '')}",
                                params={"season_id": self.season}).json()
        self.assertEqual(ficha["survival_pct"], exp[forma])

    def test_pokedex_sets_solo_de_rosters_publicos(self):
        self._battle(0)
        self._register()
        url = "/api/stats/pokemon/garchomp"
        self.assertEqual(self.client.get(url, params={"season_id": self.season}).json()["sets"]["players"], 0)
        self._set_restrictions(registration_closed=True)
        d = self.client.get(url, params={"season_id": self.season}).json()
        self.assertEqual(d["sets"]["players"], 1)
        self.assertEqual({m["name"] for m in d["sets"]["moves"]}, {"Earthquake", "Outrage"})
        self.assertEqual(d["sets"]["tera_types"], [{"name": "Dragon", "count": 1}])
        self.assertEqual(d["users"][0]["username"], "Ash")

    # ── Ban Radar ─────────────────────────────────────────────────────────────

    def test_ban_radar(self):
        for n in range(3):
            self._battle(n, "Ash", date=f"2032-01-{10 + n}")
        r = self.client.get("/api/ban/candidates", params={"min_battles": 3})
        self.assertEqual(r.status_code, 200)
        names = {c["species"] for c in r.json() if c["format_name"] == "gen9feat"}
        self.assertIn("Clefable", names)                       # ganó 3 de 3
        self.assertNotIn("Ferrothorn", names)                  # el rival perdió siempre
        self.assertEqual(self.client.get("/api/ban/candidates", params={"min_battles": 4}).json(), [])
        # con un voto, el radar muestra los votos actuales
        self.who = "Ash"
        self.assertEqual(self.client.post("/api/ban/submit", json={"pokemon_name": "Clefable"}).status_code, 200)
        votes = {c["species"]: c["votes"] for c in self.client.get("/api/ban/candidates").json()}
        self.assertEqual(votes["Clefable"], 1)

    # ── Teambuilder en vivo ───────────────────────────────────────────────────

    def test_checklist_del_teambuilder(self):
        team = [_mon("Glaceon"), _mon("Pikachu")]   # hielo y amarillo, según el dex
        r = self.client.post("/api/teams/me/validate", json={"pokemon": team}).json()
        rows = {c["rule"]: c for c in r["checklist"]}
        self.assertTrue(r["ok"])
        self.assertTrue(rows["type_of_month"]["ok"] and rows["required_color"]["ok"] and rows["team_size"]["ok"])
        bad = self.client.post("/api/teams/me/validate", json={"pokemon": [_mon("Mew")]}).json()
        rows = {c["rule"]: c for c in bad["checklist"]}
        self.assertFalse(bad["ok"])
        self.assertFalse(rows["type_of_month"]["ok"])
        self.assertFalse(rows["required_color"]["ok"])

    def test_checklist_marca_los_baneados(self):
        self.assertEqual(self.client.post("/api/ban/submit", json={"pokemon_name": "Mew"}).status_code, 200)
        r = self.client.post("/api/teams/me/validate", json={"pokemon": [_mon("Mew")]}).json()
        banned = next(c for c in r["checklist"] if c["rule"] == "banned")
        self.assertEqual((banned["ok"], banned["names"]), (False, ["Mew"]))

    # ── Reemplazo atómico ─────────────────────────────────────────────────────

    def test_swap_reemplaza_en_una_sola_transaccion(self):
        self.assertEqual(self._register().status_code, 200)
        me = self.client.get("/api/teams/me").json()
        old = next(p for p in me["pool"] if p["name"] == "Pikachu")["pokemon_id"]
        r = self.client.post("/api/teams/me/swap", json={"remove_pokemon_id": old, "add": _mon("Salamence", color="yellow")})
        self.assertEqual(r.status_code, 200)
        names = {p["name"] for p in self.client.get("/api/teams/me").json()["pool"]}
        self.assertEqual(names, (set(POOL) - {"Pikachu"}) | {"Salamence"})

    def test_swap_fallido_no_quita_nada(self):
        self.assertEqual(self._register().status_code, 200)
        self.assertEqual(self.client.post("/api/ban/submit", json={"pokemon_name": "Mew"}).status_code, 200)
        me = self.client.get("/api/teams/me").json()
        old = me["pool"][0]["pokemon_id"]
        banned = self.client.post("/api/teams/me/swap", json={"remove_pokemon_id": old, "add": _mon("Mew")})
        self.assertEqual((banned.status_code, banned.json()["detail"]), (422, "banned:Mew"))
        dup = self.client.post("/api/teams/me/swap", json={"remove_pokemon_id": old, "add": _mon("Clefable")})
        self.assertEqual(dup.status_code, 409)
        self.assertEqual(len(self.client.get("/api/teams/me").json()["pool"]), len(POOL))   # nada se quitó

    def test_swap_respeta_el_registro_cerrado(self):
        self.assertEqual(self._register().status_code, 200)
        old = self.client.get("/api/teams/me").json()["pool"][0]["pokemon_id"]
        self._set_restrictions(registration_closed=True)
        r = self.client.post("/api/teams/me/swap", json={"remove_pokemon_id": old, "add": _mon("Mew")})
        self.assertEqual((r.status_code, r.json()["detail"]), (409, "registration_closed"))

    # ── Edición libre de sets ─────────────────────────────────────────────────

    def test_editar_un_set_no_consume_rotaciones(self):
        self.assertEqual(self._register().status_code, 200)
        antes = self.client.get("/api/teams/me").json()["rotations_used"]
        pokemon_id = next(
            p["pokemon_id"] for p in self.client.get("/api/teams/me").json()["pool"]
            if p["name"] == "Garchomp"
        )
        response = self.client.patch(f"/api/teams/me/pokemon/{pokemon_id}", json={
            "name": "Garchomp", "moves": ["Swords Dance", "Earthquake"],
            "held_item": "Life Orb", "ability": "Rough Skin",
        })
        self.assertEqual(response.status_code, 200)
        despues = self.client.get("/api/teams/me").json()
        self.assertEqual(despues["rotations_used"], antes)
        chomp = next(p for p in despues["pool"] if p["name"] == "Garchomp")
        self.assertEqual(chomp["held_item"], "Life Orb")
        self.assertIn("Swords Dance", chomp["moves"])

    def test_editar_un_set_invalida_el_veredicto_anterior(self):
        self.assertEqual(self._register().status_code, 200)
        response = self.client.post(
            "/api/ingest/roster-validation",
            headers=self.ingest_headers,
            json={"ps_commit": "abc1234", "results": {"ash": []}},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/teams/me").json()["validation"]["state"], "ok")
        pokemon = self.client.get("/api/teams/me").json()["pool"][0]
        response = self.client.patch(
            f"/api/teams/me/pokemon/{pokemon['pokemon_id']}",
            json={"name": pokemon["name"], "moves": ["Protect"]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/teams/me").json()["validation"]["state"], "pending")

    def test_no_se_puede_cambiar_la_especie_con_patch(self):
        self.assertEqual(self._register().status_code, 200)
        pokemon_id = next(
            p["pokemon_id"] for p in self.client.get("/api/teams/me").json()["pool"]
            if p["name"] == "Garchomp"
        )
        response = self.client.patch(
            f"/api/teams/me/pokemon/{pokemon_id}",
            json={"name": "Dragonite", "moves": []},
        )
        self.assertEqual((response.status_code, response.json()["detail"]), (422, "species_mismatch"))

    def test_editar_un_set_respeta_las_reglas(self):
        self._set_restrictions(item_clause=True)
        self.assertEqual(self._register().status_code, 200)
        roster = self.client.get("/api/teams/me").json()["pool"]
        chomp = next(p for p in roster if p["name"] == "Garchomp")
        clefable = next(p for p in roster if p["name"] == "Clefable")
        response = self.client.patch(
            f"/api/teams/me/pokemon/{clefable['pokemon_id']}",
            json={"name": "Clefable", "held_item": chomp["held_item"], "moves": []},
        )
        self.assertEqual(response.status_code, 422)
        self.assertTrue(response.json()["detail"].startswith("item_clause:"))

    def test_no_se_puede_editar_con_el_registro_cerrado(self):
        self.assertEqual(self._register().status_code, 200)
        pokemon_id = self.client.get("/api/teams/me").json()["pool"][0]["pokemon_id"]
        self._set_restrictions(registration_closed=True)
        response = self.client.patch(
            f"/api/teams/me/pokemon/{pokemon_id}",
            json={"name": self.client.get("/api/teams/me").json()["pool"][0]["name"], "moves": []},
        )
        self.assertEqual((response.status_code, response.json()["detail"]), (409, "registration_closed"))

    def test_no_se_puede_editar_un_roster_bloqueado(self):
        self.assertEqual(self._register().status_code, 200)
        pokemon = self.client.get("/api/teams/me").json()["pool"][0]
        with BATSDatabase(DSN) as db:
            db.execute(
                "UPDATE tournament.roster SET is_locked = TRUE WHERE season_id = %s AND LOWER(username) = 'ash'",
                (self.season,),
            )
        response = self.client.patch(
            f"/api/teams/me/pokemon/{pokemon['pokemon_id']}",
            json={"name": pokemon["name"], "moves": []},
        )
        self.assertEqual((response.status_code, response.json()["detail"]), (409, "roster_locked"))

    # ── Rosters privados para Showdown ────────────────────────────────────────

    def test_rosters_exige_el_token_de_ingesta(self):
        self.assertEqual(self.client.get("/api/teams/rosters").status_code, 401)

    def test_rosters_devuelve_sets_canonicos_y_paste(self):
        self.assertEqual(self._register().status_code, 200)
        response = self.client.get("/api/teams/rosters", headers=self.ingest_headers)
        self.assertEqual(response.status_code, 200)
        roster = response.json()["rosters"]["ash"]
        self.assertTrue(any(value.startswith("garchomp|") for value in roster["sets"]))
        self.assertIn("Garchomp", roster["paste"])

    def test_rosters_publica_enforcement_de_la_temporada(self):
        self._set_restrictions(roster_enforcement=True)
        response = self.client.get("/api/teams/rosters", headers=self.ingest_headers)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["enforcement"])

    def test_meta_del_dex_importado(self):
        response = self.client.get("/api/dex/meta")
        self.assertEqual(response.status_code, 200)
        self.assertGreater(response.json()["species_count"], 1000)
        self.assertTrue(response.json()["ps_commit"])

    # ── Admin: equipos registrados ───────────────────────────────────────────

    def test_admin_rosters_exige_ser_admin(self):
        del app.dependency_overrides[auth.require_admin]
        self.assertEqual(self.client.get("/api/admin/rosters").status_code, 403)

    def test_admin_rosters_lista_los_equipos_de_la_temporada_activa(self):
        self.assertEqual(self._register().status_code, 200)
        rows = self.client.get("/api/admin/rosters").json()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["username"], "ash")
        self.assertEqual(row["pokemon_count"], len(POOL))
        self.assertEqual(row["changes_used"], 0)
        self.assertFalse(row["is_locked"])
        self.assertFalse(row["has_lineup"])
        self.assertEqual(row["validation"], {"state": "pending", "errors": [], "checked_at": None})

    def test_admin_rosters_incluye_el_veredicto_del_validador(self):
        self.assertEqual(self._register().status_code, 200)
        self.client.post("/api/ingest/roster-validation", headers=self.ingest_headers,
                          json={"ps_commit": "abc1234", "results": {"ash": ["Garchomp no aprende Psychic."]}})
        row = self.client.get("/api/admin/rosters").json()[0]
        self.assertEqual(row["validation"]["state"], "errors")
        self.assertIn("Garchomp no aprende Psychic.", row["validation"]["errors"])

    def test_admin_rosters_marca_el_lineup_fijado(self):
        self.assertEqual(self._register().status_code, 200)
        self._battle(0, p1team=POOL[:6])   # fija el lineup inicial
        row = self.client.get("/api/admin/rosters").json()[0]
        self.assertTrue(row["has_lineup"])

    # ── Historial de rotaciones (lo escribe el ETL) ───────────────────────────

    def test_el_etl_registra_las_rotaciones(self):
        self.assertEqual(self._register().status_code, 200)
        team1 = ["Garchomp", "Clefable", "Rotom-Wash", "Heatran", "Corviknight", "Dragapult"]
        team2 = ["Garchomp", "Clefable", "Rotom-Wash", "Heatran", "Corviknight", "Gyarados"]
        self._battle(0, date="2032-01-10", p1team=team1)          # fija el lineup inicial: no cuenta
        self.assertEqual(self.client.get("/api/teams/me/history").json()["rotations"], [])
        self._battle(1, date="2032-01-11", p1team=team2)          # cambia un pokémon: rotación 1
        h = self.client.get("/api/teams/me/history").json()
        self.assertEqual(len(h["rotations"]), 1)
        rot = h["rotations"][0]
        self.assertEqual(rot["change_number"], 1)
        self.assertIn("Gyarados", rot["added"])
        self.assertTrue(rot["battle_id"].startswith("gen9feat-"))
        me = self.client.get("/api/teams/me").json()
        self.assertEqual((me["rotations_used"], me["rotations_remaining"]), (1, me["max_rotations"] - 1))
        self._battle(2, date="2032-01-12", p1team=team2)          # mismo lineup: no rota
        self.assertEqual(len(self.client.get("/api/teams/me/history").json()["rotations"]), 1)

    # ── Violaciones de equipo (bats_core/db/etl.py:_detect_team_violations) ────

    def _violations(self, violation_type: str, username: str = "Ash") -> list[dict]:
        rows = self.client.get(f"/api/admin/seasons/{self.season}/team-violations").json()
        return [r for r in rows if r["violation_type"] == violation_type and r["player_username"] == username]

    def test_sin_roster_registrado_marca_violacion_por_cada_pokemon_usado(self):
        self._battle(0)   # Ash nunca se registró
        rows = self._violations("no_roster_registered")
        self.assertTrue(rows)
        self.assertTrue(all(r["battle_id"] == self.battle_ids[0] for r in rows))

    def test_registrarse_despues_de_jugar_no_borra_la_violacion_ya_detectada(self):
        """El ETL es append-only: registrar el roster no reescribe violaciones pasadas."""
        self._battle(0)
        before = self._violations("no_roster_registered")
        self.assertTrue(before)
        self.assertEqual(self._register().status_code, 200)
        self._battle(1, date="2032-01-11", p1team=POOL[:6])
        after = self._violations("no_roster_registered")
        self.assertEqual(after, before)   # nada nuevo: la batalla 1 sí tiene roster

    def test_pokemon_fuera_del_pool_registrado_marca_violacion(self):
        self.assertEqual(self._register().status_code, 200)
        self._battle(0, p1team=[*POOL[:5], "Mew"])   # Mew no está en el pool de 8
        rows = self._violations("not_in_roster")
        self.assertTrue(rows)
        self.assertEqual({r["pokemon_species"] for r in rows}, {"Mew"})
        # el resto del equipo, que sí está en el pool, no genera violación
        self.assertEqual(self._violations("not_in_roster", "Ash"), rows)
        self.assertFalse(self._violations("no_roster_registered"))

    def test_rotacion_sin_cambios_disponibles_marca_violacion(self):
        """Agota los `max_team_changes` (4 por defecto) y comprueba que el 5º cambio no se aplica."""
        self.assertEqual(self._register().status_code, 200)
        base = POOL[:6]
        lineups = [
            base,                          # batalla 0: fija el lineup inicial (no cuenta)
            [*base[:5], POOL[6]],          # rotación 1
            [*base[:5], POOL[7]],          # rotación 2
            [*base[:5], base[5]],          # rotación 3 (vuelve al lineup inicial)
            [*base[:5], POOL[6]],          # rotación 4 — agota max_team_changes
            [*base[:5], POOL[7]],          # 5º cambio: sin cambios disponibles → violación
        ]
        for i, team in enumerate(lineups):
            self._battle(i, date=f"2032-01-{10 + i}", p1team=team)

        me = self.client.get("/api/teams/me").json()
        self.assertEqual((me["rotations_used"], me["rotations_remaining"]), (4, 0))

        rows = self._violations("rotation_exceeded")
        self.assertTrue(rows)
        self.assertTrue(all(r["battle_id"] == self.battle_ids[-1] for r in rows))
        # la última batalla no se contó como rotación válida (se quedó en 4, no en 5)
        self.assertEqual(len(self.client.get("/api/teams/me/history").json()["rotations"]), 4)


if __name__ == "__main__":
    unittest.main()
