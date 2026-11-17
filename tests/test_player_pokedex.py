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


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestPlayerPokedexStats(unittest.TestCase):

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
        self.ana = f"Ana{self.tag}"
        self.bea = f"Bea{self.tag}"
        self.bot = f"Bot{self.tag}"
        self.sin = f"sin{self.tag}"
        self.battles: list[str] = []
        self.seasons: list[int] = []
        with BATSDatabase(DSN) as db:
            db.execute(
                "INSERT INTO tournament.player_accounts (email, username) VALUES (%s, %s)",
                (f"sin-{self.tag}@x.test", f"Sin{self.tag}"),
            )
            db.execute(
                "INSERT INTO battle.dim_players (username, is_bot) VALUES (%s, TRUE) ON CONFLICT (username) DO NOTHING",
                (self.bot,),
            )
            for name, month_type, start, end in (
                (f"S1-{self.tag}", "Fire", "2026-10-01", "2026-10-31"),
                (f"S2-{self.tag}", "Ice", "2026-11-01", "2026-11-30"),
            ):
                row = db.fetchone(
                    "INSERT INTO tournament.seasons (season_name, type_of_month, start_date, end_date) "
                    "VALUES (%s, %s, %s, %s) RETURNING season_id",
                    (name, month_type, start, end),
                )
                self.seasons.append(row["season_id"])
            db.commit()
        self.addCleanup(self._cleanup)
        self.client = TestClient(app, raise_server_exceptions=False)

    def _cleanup(self):
        with BATSDatabase(DSN) as db:
            if self.battles:
                db.execute("DELETE FROM battle.fact_battles WHERE battle_id = ANY(%s)", (self.battles,))
                db.execute("DELETE FROM battle.etl_log WHERE battle_id = ANY(%s)", (self.battles,))
            db.execute("DELETE FROM tournament.pokedex_seen WHERE username LIKE %s", (f"%{self.tag}",))
            db.execute("DELETE FROM tournament.player_accounts WHERE email LIKE %s", (f"%{self.tag}@x.test",))
            db.execute("DELETE FROM battle.dim_players WHERE username LIKE %s", (f"%{self.tag}",))
            if self.seasons:
                db.execute("DELETE FROM tournament.seasons WHERE season_id = ANY(%s)", (self.seasons,))
            db.commit()

    def _load(
        self,
        suffix: str,
        date: str,
        p1: str,
        p2: str,
        winner: str,
        p1_team: list[str],
        p2_team: list[str],
        stats: list,
        fmt: str = "gen9pinchesgueysleague",
    ) -> str:
        from bats_core.db.etl import BATSEtl
        from bats_core.parser import BattleData

        battle_id = f"{fmt}-{self.tag}-{suffix}"
        self.battles.append(battle_id)
        battle = BattleData(
            battle_id=battle_id,
            format=fmt,
            date=date,
            p1=p1,
            p2=p2,
            winner=winner,
            turns=10,
            end_type="normal" if winner else "tie",
            p1_team=p1_team,
            p2_team=p2_team,
            pokemon_stats=stats,
        )
        with BATSDatabase(DSN) as db:
            BATSEtl(db).load_battle(battle, f"test://{battle_id}")
        return battle_id

    def _by_species(self, username: str) -> dict[str, dict]:
        res = self.client.get(f"/api/players/{username}/pokedex/stats")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["username"], username.strip().lower())
        return {item["species"]: item for item in body["species"]}

    def test_used_faced_y_ambos_todas_temporadas(self):
        from bats_core.parser import PokemonStats

        # Batalla 1 (S1, oct): Ana gana vs Bea. Ambas sacan Garchomp (mirror), Ana saca Charizard-Mega-Y,
        # Bea saca Heatran. Ana lleva Tauros en banca (was_active=False) y Bea lleva Weavile en banca.
        b1 = self._load(
            "1", "2026-10-15", self.ana, self.bea, self.ana,
            ["Garchomp", "Charizard-Mega-Y", "Tauros"],
            ["Garchomp", "Heatran", "Weavile"],
            [
                PokemonStats(species="Garchomp", player=self.ana, kills=2, turns_active=4, survived=True, final_hit=True),
                PokemonStats(species="Charizard-Mega-Y", player=self.ana, kills=1, turns_active=4, survived=False, final_hit=False),
                PokemonStats(species="Garchomp", player=self.bea, kills=1, turns_active=4, survived=False, final_hit=False),
                PokemonStats(species="Heatran", player=self.bea, kills=2, turns_active=4, survived=False, final_hit=False),
            ],
        )
        # Batalla 2 (S2, nov): Bea es p1, Ana es p2; gana Bea.
        # Ana saca Garchomp; Bea saca Heatran y Scizor-Mega.
        self._load(
            "2", "2026-11-10", self.bea, self.ana, self.bea,
            ["Heatran", "Scizor-Mega"],
            ["Garchomp"],
            [
                PokemonStats(species="Heatran", player=self.bea, kills=1, turns_active=4, survived=True, final_hit=True),
                PokemonStats(species="Scizor-Mega", player=self.bea, kills=0, turns_active=2, survived=True, final_hit=False),
                PokemonStats(species="Garchomp", player=self.ana, kills=0, turns_active=4, survived=False, final_hit=False),
            ],
        )
        # Batalla 3 (S2, nov): empate vs Bea. Bea saca Heatran (no suma win para Ana).
        self._load(
            "3", "2026-11-12", self.ana, self.bea, "",
            ["Charizard-Mega-Y"],
            ["Heatran"],
            [
                PokemonStats(species="Charizard-Mega-Y", player=self.ana, kills=0, turns_active=4, survived=True, final_hit=False),
                PokemonStats(species="Heatran", player=self.bea, kills=1, turns_active=4, survived=True, final_hit=False),
            ],
        )

        got = self._by_species(self.ana)

        # Solo usada: Charizard-Mega-Y
        # b1 mvp = 1*2 + 0 + 0 + 4*0.25 = 3.0; b3 mvp = 0 + 1 + 0 + 4*0.25 = 2.0
        self.assertEqual(got["Charizard-Mega-Y"], {
            "species": "Charizard-Mega-Y",
            "used": {
                "battles": 2,
                "kills": 1,
                "mvp": 5.0,
                "best": {
                    "battle_id": b1,
                    "kills": 1,
                    "mvp": 3.0,
                    "opponent": self.bea.lower(),
                    "date": "2026-10-15",
                },
            },
            "faced": None,
        })

        # Ambos lados (used + faced): Garchomp
        # b1 used mvp = 2*2 + 1 + 1 + 4*0.25 = 7.0; b2 used mvp = 0 + 0 + 0 + 4*0.25 = 1.0
        self.assertEqual(got["Garchomp"], {
            "species": "Garchomp",
            "used": {
                "battles": 2,
                "kills": 2,
                "mvp": 8.0,
                "best": {
                    "battle_id": b1,
                    "kills": 2,
                    "mvp": 7.0,
                    "opponent": self.bea.lower(),
                    "date": "2026-10-15",
                },
            },
            "faced": {"battles": 1, "kills_against": 1, "wins": 1},
        })

        # Solo enfrentada: Heatran (3 batallas: ganó b1, perdió b2, empató b3 -> wins=1)
        self.assertEqual(got["Heatran"], {
            "species": "Heatran",
            "used": None,
            "faced": {"battles": 3, "kills_against": 4, "wins": 1},
        })
        self.assertEqual(got["Scizor-Mega"], {
            "species": "Scizor-Mega",
            "used": None,
            "faced": {"battles": 1, "kills_against": 0, "wins": 0},
        })

        # Banca (was_active=False) excluida de ambos lados
        self.assertNotIn("Tauros", got)
        self.assertNotIn("Weavile", got)

    def test_excluye_bot_y_formato_no_liga(self):
        from bats_core.parser import PokemonStats

        # Batalla contra el bot en formato de liga -> excluida
        self._load(
            "bot", "2026-11-05", self.ana, self.bot, self.ana,
            ["Garchomp"], ["Weavile"],
            [
                PokemonStats(species="Garchomp", player=self.ana, kills=3, turns_active=4, survived=True, final_hit=True),
                PokemonStats(species="Weavile", player=self.bot, kills=1, turns_active=4, survived=False, final_hit=False),
            ],
        )
        # Batalla sparring (formato no-liga) -> excluida
        self._load(
            "sparring", "2026-11-06", self.ana, self.bea, self.ana,
            ["Heatran"], ["Scizor-Mega"],
            [
                PokemonStats(species="Heatran", player=self.ana, kills=2, turns_active=4, survived=True, final_hit=True),
                PokemonStats(species="Scizor-Mega", player=self.bea, kills=1, turns_active=4, survived=False, final_hit=False),
            ],
            fmt="gen9pglsparring",
        )

        # Ana y Bea existen en dim_players pero no tienen batallas válidas de liga
        self.assertEqual(self._by_species(self.ana), {})
        self.assertEqual(self._by_species(self.bea), {})

    def test_desempate_mejor_batalla(self):
        from bats_core.parser import PokemonStats

        # Desempate 1: mismo mvp_score (5.0), gana la de más kills (2 > 1) aunque sea más vieja
        b_more_kills = self._load(
            "mk", "2026-11-01", self.ana, self.bea, self.ana,
            ["Garchomp"], ["Heatran"],
            [
                PokemonStats(species="Garchomp", player=self.ana, kills=2, turns_active=4, survived=False, final_hit=False),
                PokemonStats(species="Heatran", player=self.bea, kills=0, turns_active=4, survived=False, final_hit=False),
            ],
        )
        self._load(
            "fk", "2026-11-10", self.ana, self.bea, self.ana,
            ["Garchomp"], ["Heatran"],
            [
                PokemonStats(species="Garchomp", player=self.ana, kills=1, turns_active=4, survived=True, final_hit=True),
                PokemonStats(species="Heatran", player=self.bea, kills=0, turns_active=4, survived=False, final_hit=False),
            ],
        )

        # Desempate 2: mismo mvp_score (3.0) y mismos kills (1), gana la batalla más reciente
        self._load(
            "old", "2026-11-02", self.ana, self.bea, self.ana,
            ["Weavile"], ["Heatran"],
            [
                PokemonStats(species="Weavile", player=self.ana, kills=1, turns_active=0, survived=True, final_hit=False),
                PokemonStats(species="Heatran", player=self.bea, kills=0, turns_active=4, survived=False, final_hit=False),
            ],
        )
        b_newer = self._load(
            "new", "2026-11-14", self.ana, self.bea, self.ana,
            ["Weavile"], ["Heatran"],
            [
                PokemonStats(species="Weavile", player=self.ana, kills=1, turns_active=0, survived=True, final_hit=False),
                PokemonStats(species="Heatran", player=self.bea, kills=0, turns_active=4, survived=False, final_hit=False),
            ],
        )

        got = self._by_species(self.ana)
        self.assertEqual(got["Garchomp"]["used"]["best"]["battle_id"], b_more_kills)
        self.assertEqual(got["Garchomp"]["used"]["best"]["kills"], 2)
        self.assertEqual(got["Garchomp"]["used"]["best"]["mvp"], 5.0)
        self.assertEqual(got["Weavile"]["used"]["best"]["battle_id"], b_newer)
        self.assertEqual(got["Weavile"]["used"]["best"]["date"], "2026-11-14")

    def test_normaliza_username_sin_distinguir_mayusculas_ni_espacios(self):
        from bats_core.parser import PokemonStats

        self._load(
            "norm", "2026-11-08", self.ana, self.bea, self.ana,
            ["Garchomp"], ["Heatran"],
            [
                PokemonStats(species="Garchomp", player=self.ana, kills=1, turns_active=4, survived=True, final_hit=True),
                PokemonStats(species="Heatran", player=self.bea, kills=0, turns_active=4, survived=False, final_hit=False),
            ],
        )
        res_normal = self.client.get(f"/api/players/{self.ana.lower()}/pokedex/stats")
        res_padded = self.client.get(f"/api/players/%20{self.ana.upper()}%20/pokedex/stats")
        self.assertEqual(res_normal.status_code, 200)
        self.assertEqual(res_padded.status_code, 200)
        self.assertEqual(res_normal.json(), res_padded.json())

    def test_jugador_con_cuenta_sin_batallas_y_404(self):
        res_empty = self.client.get(f"/api/players/{self.sin}/pokedex/stats")
        self.assertEqual(res_empty.status_code, 200)
        self.assertEqual(res_empty.json(), {"username": self.sin, "species": []})

        res_404 = self.client.get(f"/api/players/nadie{self.tag}/pokedex/stats")
        self.assertEqual(res_404.status_code, 404)
        self.assertIn("detail", res_404.json())
