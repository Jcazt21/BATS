"""
tests/test_dex.py
=================
Espejo del dex de Showdown en tournament.dex_species (bats_core/dex.py) contra una DB
desechable (BATS_TEST_DSN).
"""
import json
import os
import tempfile
import unittest
from pathlib import Path

from bats_core import dex
from bats_core.db.connection import BATSDatabase

DSN = os.environ.get("BATS_TEST_DSN")

SNAPSHOT = {
    "garchomp": {"id": "garchomp", "name": "Garchomp", "num": 445, "types": ["Dragon", "Ground"],
                 "bst": 600, "color": "Blue", "eggGroups": ["Monster", "Dragon"], "gen": 4,
                 "tags": [], "spriteid": "garchomp", "baseSpecies": "Garchomp",
                 "restricted": False, "paradox": False, "ultraBeast": False, "pseudo": True,
                 "leagueLegal": True},
    "koraidon": {"id": "koraidon", "name": "Koraidon", "num": 1007, "types": ["Fighting", "Dragon"],
                 "bst": 670, "color": "Red", "eggGroups": ["Undiscovered"], "gen": 9,
                 "tags": ["Restricted Legendary"], "spriteid": "koraidon",
                 "baseSpecies": "Koraidon", "restricted": True, "paradox": False,
                 "ultraBeast": False, "pseudo": False, "leagueLegal": True},
    "greattusk": {"id": "greattusk", "name": "Great Tusk", "num": 984, "types": ["Ground", "Fighting"],
                  "bst": 570, "color": "Gray", "eggGroups": ["Undiscovered"], "gen": 9,
                  "tags": ["Paradox"], "spriteid": "greattusk", "baseSpecies": "Great Tusk",
                  "restricted": False, "paradox": True, "ultraBeast": False, "pseudo": False,
                  "leagueLegal": True},
}


def write_snapshot(directory: str) -> None:
    Path(directory, "species.json").write_text(json.dumps(SNAPSHOT))
    Path(directory, "meta.json").write_text(json.dumps(
        {"generated_at": "2026-09-21T00:00:00.000Z", "ps_commit": "abc1234"}))


@unittest.skipUnless(DSN, "Define BATS_TEST_DSN apuntando a una base desechable.")
class TestImportacionDelDex(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        db_dir = Path(__file__).parent.parent / "bats_core" / "db"
        with BATSDatabase(DSN) as db:
            db.apply_schema(db_dir / "schema.sql")
            db.apply_migrations(db_dir / "migrations")

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        write_snapshot(self.tmp.name)

    def test_importa_y_es_idempotente(self):
        with BATSDatabase(DSN) as db:
            first = dex.import_snapshot(db, self.tmp.name)
            second = dex.import_snapshot(db, self.tmp.name)
            self.assertEqual(first["species"], 3)
            self.assertEqual(second["species"], 3)
            row = db.fetchone(
                "SELECT COUNT(*) AS n FROM tournament.dex_species WHERE species_id = ANY(%s)",
                (list(SNAPSHOT),))
            self.assertEqual(row["n"], 3)

    def test_species_meta_resuelve_por_nombre_y_por_id(self):
        with BATSDatabase(DSN) as db:
            dex.import_snapshot(db, self.tmp.name)
            meta = dex.species_meta(db, ["Garchomp", "koraidon", "Great Tusk", "Missingno"])
            self.assertTrue(meta["Garchomp"]["is_pseudo"])
            self.assertTrue(meta["koraidon"]["is_restricted"])
            self.assertFalse(meta["koraidon"]["is_paradox"])
            self.assertTrue(meta["Great Tusk"]["is_paradox"])
            self.assertEqual(meta["Garchomp"]["types"], "Dragon / Ground")
            self.assertEqual(meta["Garchomp"]["egg_groups"], ["Monster", "Dragon"])
            self.assertNotIn("Missingno", meta)

    def test_guarda_la_version_del_snapshot(self):
        with BATSDatabase(DSN) as db:
            dex.import_snapshot(db, self.tmp.name)
            row = db.fetchone("SELECT ps_commit, species_count FROM tournament.dex_meta")
            self.assertEqual(row["species_count"], len(SNAPSHOT))
            self.assertEqual(row["ps_commit"], "abc1234")


class TestSinDb(unittest.TestCase):

    def test_species_meta_sin_nombres_no_toca_la_db(self):
        self.assertEqual(dex.species_meta(None, []), {})
