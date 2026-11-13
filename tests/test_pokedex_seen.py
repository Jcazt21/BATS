"""
tests/test_pokedex_seen.py
==========================
Pokédex por cuenta: la tabla tournament.pokedex_seen (v13) y cómo la sigue el
rename de cuentas. Necesita una base DESECHABLE en BATS_TEST_DSN:

    BATS_TEST_DSN=postgresql://localhost/bats_test python -m pytest tests/test_pokedex_seen.py -v
"""
import os
import unittest
import uuid
from pathlib import Path

from bats_core.api.routes.admin import _rename_username_cascade
from bats_core.db.connection import BATSDatabase

DSN = os.environ.get("BATS_TEST_DSN")
DB_DIR = Path(__file__).parent.parent / "bats_core" / "db"


def _seen(db, username: str, species_id: str, at: str, opponent: str = "rival", battle: str = "b-1") -> None:
    db.execute(
        "INSERT INTO tournament.pokedex_seen (username, species_id, species, first_seen_at, battle_id, opponent) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (username, species_id, species_id.title(), at, battle, opponent),
    )


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestPokedexSeenSchema(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        with BATSDatabase(DSN) as db:
            db.apply_schema(DB_DIR / "schema.sql")
            db.apply_migrations(DB_DIR / "migrations")

    def setUp(self):
        self.tag = uuid.uuid4().hex[:8]
        self.ana, self.bea, self.otro = f"ana{self.tag}", f"bea{self.tag}", f"otro{self.tag}"
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        with BATSDatabase(DSN) as db:
            db.execute("DELETE FROM tournament.pokedex_seen WHERE username LIKE %s", (f"%{self.tag}",))
            db.commit()

    def _rows(self, db, username: str) -> dict[str, dict]:
        rows = db.fetchall(
            "SELECT species_id, first_seen_at::date::text AS day, battle_id, opponent "
            "FROM tournament.pokedex_seen WHERE username = %s", (username,))
        return {r["species_id"]: r for r in rows}

    def test_aplica_la_migracion_dos_veces(self):
        with BATSDatabase(DSN) as db:
            db.apply_migrations(DB_DIR / "migrations")
            pk = db.fetchall(
                """
                SELECT a.attname FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                WHERE i.indrelid = 'tournament.pokedex_seen'::regclass AND i.indisprimary
                """)
        self.assertEqual({r["attname"] for r in pk}, {"username", "species_id"})

    def test_rename_mueve_los_avistamientos(self):
        with BATSDatabase(DSN) as db:
            _seen(db, self.ana, "garchomp", "2026-11-02")
            _seen(db, self.ana, "weavile", "2026-11-03")
            _rename_username_cascade(db, self.ana.upper(), self.bea)
            db.commit()
            self.assertEqual(set(self._rows(db, self.bea)), {"garchomp", "weavile"})
            self.assertEqual(self._rows(db, self.ana), {})

    def test_rename_fusiona_conservando_el_mas_antiguo(self):
        with BATSDatabase(DSN) as db:
            _seen(db, self.ana, "garchomp", "2026-11-02", battle="b-ana")
            _seen(db, self.bea, "garchomp", "2026-11-05", battle="b-bea")
            _rename_username_cascade(db, self.ana, self.bea)
            db.commit()
            rows = self._rows(db, self.bea)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows["garchomp"]["day"], "2026-11-02")
        self.assertEqual(rows["garchomp"]["battle_id"], "b-ana")

    def test_rename_actualiza_opponent(self):
        with BATSDatabase(DSN) as db:
            _seen(db, self.otro, "heatran", "2026-11-04", opponent=self.ana)
            _rename_username_cascade(db, self.ana, self.bea)
            db.commit()
            self.assertEqual(self._rows(db, self.otro)["heatran"]["opponent"], self.bea)

    def test_rename_cuenta_las_filas_movidas(self):
        with BATSDatabase(DSN) as db:
            _seen(db, self.ana, "garchomp", "2026-11-02")
            cascade = _rename_username_cascade(db, self.ana, self.bea)
            db.commit()
        self.assertEqual(cascade["pokedex"], 1)

    def test_rename_solo_de_mayusculas_no_borra_nada(self):
        with BATSDatabase(DSN) as db:
            _seen(db, self.ana, "garchomp", "2026-11-02")
            cascade = _rename_username_cascade(db, self.ana, self.ana.upper())
            db.commit()
            self.assertEqual(set(self._rows(db, self.ana)), {"garchomp"})
        self.assertEqual(cascade["pokedex"], 0)


# ─── Registro al cargar una batalla (BATSEtl._record_pokedex_seen) ────────────

def _battle(battle_id: str, p1: str, p2: str, date: str, fmt: str = "gen9pinchesgueysleague"):
    """p1 saca Garchomp y Scizor-Mega (Heatran en banca); p2 saca Weavile."""
    from bats_core.parser import BattleData, PokemonStats
    return BattleData(
        battle_id=battle_id, format=fmt, date=date, p1=p1, p2=p2, winner=p1, turns=12, end_type="normal",
        p1_team=["Garchomp", "Scizor-Mega", "Heatran"], p2_team=["Weavile"],
        pokemon_stats=[
            PokemonStats(species="Garchomp", player=p1, kills=1),
            PokemonStats(species="Scizor-Mega", player=p1),
            PokemonStats(species="Weavile", player=p2, survived=False),
        ],
    )


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestRecordPokedexSeen(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        with BATSDatabase(DSN) as db:
            db.apply_schema(DB_DIR / "schema.sql")
            db.apply_migrations(DB_DIR / "migrations")

    def setUp(self):
        self.tag = uuid.uuid4().hex[:8]
        self.ana, self.bea = f"Ana{self.tag}", f"Bea{self.tag}"
        self.battles: list[str] = []
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        with BATSDatabase(DSN) as db:
            for b in self.battles:
                db.execute("DELETE FROM battle.fact_battles WHERE battle_id = %s", (b,))
                db.execute("DELETE FROM battle.etl_log WHERE battle_id = %s", (b,))
            db.execute("DELETE FROM tournament.pokedex_seen WHERE username LIKE %s", (f"%{self.tag}",))
            db.commit()

    def _load(self, suffix: str, date: str, fmt: str = "gen9pinchesgueysleague", force_path: str | None = None) -> None:
        from bats_core.db.etl import BATSEtl
        battle_id = f"{fmt}-{self.tag}{suffix}"
        self.battles.append(battle_id)
        with BATSDatabase(DSN) as db:
            BATSEtl(db).load_battle(_battle(battle_id, self.ana, self.bea, date, fmt), force_path or f"test://{battle_id}")

    def _seen(self, username: str) -> dict[str, dict]:
        with BATSDatabase(DSN) as db:
            rows = db.fetchall(
                "SELECT species_id, battle_id, opponent, first_seen_at::date::text AS day "
                "FROM tournament.pokedex_seen WHERE username = %s", (username.lower(),))
        return {r["species_id"]: r for r in rows}

    def test_cada_jugador_ve_sus_activos_y_los_del_rival(self):
        self._load("a", "2026-11-10")
        esperado = {"garchomp", "scizormega", "weavile"}
        self.assertEqual(set(self._seen(self.ana)), esperado)
        self.assertEqual(set(self._seen(self.bea)), esperado)

    def test_guarda_rival_batalla_y_fecha(self):
        self._load("a", "2026-11-10")
        fila = self._seen(self.ana)["weavile"]
        self.assertEqual(fila["opponent"], self.bea.lower())
        self.assertEqual(fila["battle_id"], self.battles[0])
        self.assertEqual(fila["day"], "2026-11-10")

    def test_ignora_sparring(self):
        self._load("s", "2026-11-10", fmt="gen9pglsparring")
        self.assertEqual(self._seen(self.ana), {})

    def test_ignora_batallas_contra_el_bot(self):
        from bats_core.db.etl import BATSEtl
        with BATSDatabase(DSN) as db:
            inserted = BATSEtl(db)._record_pokedex_seen("cualquiera", "gen9pinchesgueysleague", is_bot_battle=True)
        self.assertEqual(inserted, 0)

    def test_gana_el_primer_avistamiento(self):
        self._load("a", "2026-11-10")
        self._load("b", "2026-11-12")
        self.assertEqual(self._seen(self.ana)["weavile"]["battle_id"], self.battles[0])

    def test_una_batalla_anterior_cargada_despues_gana(self):
        """Backfill fuera de orden: la batalla más vieja queda como primer avistamiento."""
        self._load("b", "2026-11-12")
        self._load("a", "2026-11-10")
        fila = self._seen(self.ana)["weavile"]
        self.assertEqual((fila["battle_id"], fila["day"]), (self.battles[1], "2026-11-10"))

    def test_reingesta_idempotente(self):
        self._load("a", "2026-11-10")
        from bats_core.db.etl import BATSEtl
        with BATSDatabase(DSN) as db:
            again = BATSEtl(db)._record_pokedex_seen(self.battles[0], "gen9pinchesgueysleague", is_bot_battle=False)
            db.commit()
        self.assertEqual(again, 0)
        self.assertEqual(len(self._seen(self.ana)), 3)
