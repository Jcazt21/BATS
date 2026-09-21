"""
tests/test_bats.py
=================
Tests unitarios con datos sintéticos que simulan el formato real de PS.
Ejecutar con: python -m pytest tests/test_bats.py -v
            o: python tests/test_bats.py
"""

import json
import tempfile
import unittest
from pathlib import Path

from bats_core.parser import (
    parse_battle_file,
    _parse_log_events,
    _extract_species,
    PokemonStats,
)
from bats_core.metrics import (
    build_raw_dataframe,
    compute_torneo_report,
    compute_pick_rate,
    detect_outliers,
    compute_mvp_score,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────

SAMPLE_LOG = [
    "|start",
    "|switch|p1a: Garchomp|Garchomp, L78, M|263/263",
    "|switch|p2a: Ferrothorn|Ferrothorn, L80, F|301/301",
    "|turn|1",
    "|move|p1a: Garchomp|Earthquake|p2a: Ferrothorn",
    "|-damage|p2a: Ferrothorn|201/301",
    "|move|p2a: Ferrothorn|Leech Seed|p1a: Garchomp",
    "|turn|2",
    "|move|p1a: Garchomp|Earthquake|p2a: Ferrothorn",
    "|-damage|p2a: Ferrothorn|0 fnt",
    "|faint|p2a: Ferrothorn",
    "|switch|p2a: Tyranitar|Tyranitar, L80, M|341/341",
    "|turn|3",
    "|move|p2a: Tyranitar|Stone Edge|p1a: Garchomp",
    "|-damage|p1a: Garchomp|0 fnt",
    "|faint|p1a: Garchomp",
    "|switch|p1a: Clefable|Clefable, L80, F|310/310",
    "|turn|4",
    "|move|p1a: Clefable|Moonblast|p2a: Tyranitar",
    "|-damage|p2a: Tyranitar|0 fnt",
    "|faint|p2a: Tyranitar",
    "|win|Ash",
]

SAMPLE_BATTLE_JSON = {
    "p1": "Ash",
    "p2": "Gary",
    "winner": "Ash",
    "turns": 4,
    "endType": "normal",
    "p1team": [
        {"species": "Garchomp"},
        {"species": "Clefable"},
        {"species": "Rotom-Wash"},
        {"species": "Heatran"},
        {"species": "Corviknight"},
        {"species": "Dragapult"},
    ],
    "p2team": [
        {"species": "Ferrothorn"},
        {"species": "Tyranitar"},
        {"species": "Toxapex"},
        {"species": "Landorus-Therian"},
        {"species": "Weavile"},
        {"species": "Volcarona"},
    ],
    "log": SAMPLE_LOG,
}


def _write_temp_log(data: dict, parts: tuple[str, ...]) -> Path:
    """Crea un archivo .log.json temporal con la estructura de ruta de PS."""
    with tempfile.TemporaryDirectory() as tmp:
        # Construir ruta: tmp/2026-03/gen9ou/2026-03-19/battle-id.log.json
        path = Path(tmp).joinpath(*parts)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")
        yield path


# ─── Tests de parser ──────────────────────────────────────────────────────────

class TestExtractSpecies(unittest.TestCase):

    def test_extracts_species_field(self):
        team = [{"species": "Garchomp"}, {"species": "Clefable"}]
        self.assertEqual(_extract_species(team), ["Garchomp", "Clefable"])

    def test_falls_back_to_name(self):
        team = [{"name": "Garchomp-Mega"}]
        self.assertEqual(_extract_species(team), ["Garchomp-Mega"])

    def test_empty_team(self):
        self.assertEqual(_extract_species([]), [])


class TestParseLogEvents(unittest.TestCase):

    def setUp(self):
        self.stats = {s.species: s for s in _parse_log_events(SAMPLE_LOG, "Ash", "Gary")}

    def test_garchomp_kills_ferrothorn(self):
        self.assertEqual(self.stats["Garchomp"].kills, 1)

    def test_tyranitar_kills_garchomp(self):
        self.assertEqual(self.stats["Tyranitar"].kills, 1)

    def test_clefable_kills_tyranitar_and_has_final_hit(self):
        self.assertEqual(self.stats["Clefable"].kills, 1)
        self.assertTrue(self.stats["Clefable"].final_hit)

    def test_ferrothorn_fainted(self):
        self.assertFalse(self.stats["Ferrothorn"].survived)

    def test_clefable_survived(self):
        self.assertTrue(self.stats["Clefable"].survived)

    def test_turns_active_positive(self):
        # Garchomp estuvo activo turnos 1 y 2
        self.assertGreater(self.stats["Garchomp"].turns_active, 0)


class TestMVPScore(unittest.TestCase):

    def test_formula_correct(self):
        stats = PokemonStats(species="Garchomp", player="Ash", kills=2, turns_active=3, final_hit=True)
        # (2×2) + sobrevive 1 + golpe final 1 + 3 turnos × 0.25 = 6.75  (fórmula única: bats_core/mvp.py)
        self.assertEqual(compute_mvp_score(stats), 6.75)

    def test_no_kills_no_final_hit(self):
        stats = PokemonStats(species="Ferrothorn", player="Gary", kills=0, turns_active=2, final_hit=False)
        # sobrevive 1 + 2 turnos × 0.25 = 1.5
        self.assertEqual(compute_mvp_score(stats), 1.5)


class TestParseBattleFile(unittest.TestCase):

    def test_valid_battle(self):
        import contextlib

        @contextlib.contextmanager
        def temp_battle(data):
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "2026-03" / "gen9ou" / "2026-03-19" / "battle-test.log.json"
                path.parent.mkdir(parents=True)
                path.write_text(json.dumps(data), encoding="utf-8")
                yield path

        with temp_battle(SAMPLE_BATTLE_JSON) as path:
            result = parse_battle_file(path)
            self.assertIsNotNone(result)
            self.assertEqual(result.p1, "Ash")
            self.assertEqual(result.winner, "Ash")
            self.assertEqual(result.turns, 4)
            self.assertEqual(result.format, "gen9ou")

    def test_corrupted_file_returns_none(self):
        with tempfile.NamedTemporaryFile(suffix=".log.json", mode="w", delete=False) as f:
            f.write("{not valid json{{")
            path = Path(f.name)
        self.assertIsNone(parse_battle_file(path))
        path.unlink()

    def test_test_battle_ignored(self):
        data = {**SAMPLE_BATTLE_JSON, "turns": 2}
        with tempfile.NamedTemporaryFile(suffix=".log.json", mode="w", delete=False) as f:
            json.dump(data, f)
            path = Path(f.name)
        self.assertIsNone(parse_battle_file(path))
        path.unlink()

    def test_missing_fields_returns_none(self):
        data = {"p1": "Ash", "turns": 10}  # faltan p2, winner, log
        with tempfile.NamedTemporaryFile(suffix=".log.json", mode="w", delete=False) as f:
            json.dump(data, f)
            path = Path(f.name)
        self.assertIsNone(parse_battle_file(path))
        path.unlink()


# ─── Tests de métricas ────────────────────────────────────────────────────────

class TestMetrics(unittest.TestCase):

    def setUp(self):
        """Crea dos batallas sintéticas para probar agregaciones."""
        from bats_core.parser import BattleData, PokemonStats

        pstats_1 = [
            PokemonStats("Garchomp",  "Ash",  kills=2, turns_active=3, survived=True, final_hit=True),
            PokemonStats("Clefable",  "Ash",  kills=0, turns_active=1, survived=True),
            PokemonStats("Ferrothorn","Gary", kills=0, turns_active=2, survived=False),
            PokemonStats("Tyranitar", "Gary", kills=1, turns_active=2, survived=False),
        ]
        pstats_2 = [
            PokemonStats("Garchomp",  "Ash",  kills=1, turns_active=4, survived=False),
            PokemonStats("Rotom-Wash","Ash",  kills=1, turns_active=2, survived=True, final_hit=True),
            PokemonStats("Ferrothorn","Gary", kills=1, turns_active=3, survived=True),
            PokemonStats("Toxapex",   "Gary", kills=0, turns_active=1, survived=False),
        ]

        self.battles = [
            BattleData("b1", "gen9ou", "2026-03-01", "Ash", "Gary", "Ash",  5, "normal", [], [], pstats_1),
            BattleData("b2", "gen9ou", "2026-03-02", "Ash", "Gary", "Gary", 6, "normal", [], [], pstats_2),
        ]

        self.df_raw = build_raw_dataframe(self.battles)

    def test_raw_df_has_expected_columns(self):
        expected = {"battle_id", "Player_User", "Pokemon_Used", "won_battle",
                    "kills_in_battle", "turns_survived", "mvp_score_battle"}
        self.assertTrue(expected.issubset(self.df_raw.columns))

    def test_report_columns(self):
        report = compute_torneo_report(self.df_raw, total_battles=2)
        expected = ["Player_User", "Pokemon_Used", "Wins", "Losses",
                    "Total_Kills", "MVP_Score", "Usage_Rate"]
        self.assertEqual(list(report.columns), expected)

    def test_garchomp_wins(self):
        report = compute_torneo_report(self.df_raw, total_battles=2)
        garchomp = report[report["Pokemon_Used"] == "Garchomp"]
        # Ash usó Garchomp en ambas batallas, ganó la primera
        ash_garchomp = garchomp[garchomp["Player_User"] == "Ash"]
        self.assertEqual(int(ash_garchomp["Wins"].iloc[0]), 1)

    def test_outlier_detection(self):
        pick = compute_pick_rate(self.df_raw, total_battles=2)
        # Garchomp y Ferrothorn aparecen en ambas batallas → 100% pick rate
        outliers = detect_outliers(pick, threshold=70.0)
        species_flagged = set(outliers["Pokemon_Used"].tolist())
        self.assertIn("Garchomp", species_flagged)
        self.assertIn("Ferrothorn", species_flagged)

    def test_no_outliers_below_threshold(self):
        pick = compute_pick_rate(self.df_raw, total_battles=2)
        outliers = detect_outliers(pick, threshold=100.0)
        # Nada supera exactamente 100% (están en 100% → no supera, es igual)
        self.assertEqual(len(outliers), 0)


# ─── Runner ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    unittest.main(verbosity=2)
