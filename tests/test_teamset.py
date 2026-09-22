"""Forma canónica de un set (la compara config/formats.ts)."""
import json
import os
import subprocess
import unittest
from pathlib import Path

from bats_core.teamset import canonical_set, to_paste


FIXTURES = json.loads(
    (Path(__file__).parent / "fixtures" / "sets_canonicos.json").read_text()
)
ROOT = Path(__file__).parent.parent
PS_DIR = Path(os.environ.get("BATS_PS_DIR", ROOT.parent / "pokemon-showdown"))
PARITY_SCRIPT = ROOT / "tools" / "roster_parity.js"


class TestCanonicalSet(unittest.TestCase):

    def test_fixtures(self):
        for case in FIXTURES:
            with self.subTest(case["set"]["name"]):
                self.assertEqual(
                    canonical_set(case["set"], case.get("primary_type")),
                    case["canonical"],
                )

    def test_el_orden_de_los_movimientos_no_importa(self):
        a = {"name": "Garchomp", "moves": ["Earthquake", "Spikes"], "ability": "Rough Skin"}
        b = {"name": "Garchomp", "moves": ["Spikes", "Earthquake"], "ability": "Rough Skin"}
        self.assertEqual(canonical_set(a), canonical_set(b))

    def test_el_apodo_no_importa(self):
        a = {"name": "Garchomp", "nickname": "Chompy", "moves": []}
        self.assertEqual(canonical_set(a), canonical_set({"name": "Garchomp", "moves": []}))

    def test_cambiar_un_ev_cambia_la_forma(self):
        a = {"name": "Garchomp", "moves": [], "evs": {"HP": 252}}
        b = {"name": "Garchomp", "moves": [], "evs": {"HP": 248}}
        self.assertNotEqual(canonical_set(a), canonical_set(b))

    def test_tera_vacio_usa_el_tipo_primario(self):
        sin_tera = canonical_set({"name": "Garchomp", "moves": []}, primary_type="Dragon")
        con_tera = canonical_set({"name": "Garchomp", "moves": [], "tera_type": "Dragon"})
        self.assertEqual(sin_tera, con_tera)

    def test_paste_de_un_set(self):
        paste = to_paste({
            "name": "Garchomp", "held_item": "Rocky Helmet", "ability": "Rough Skin",
            "tera_type": "Steel", "evs": {"Spe": 4, "HP": 252}, "nature": "Impish",
            "ivs": {"SpA": 0}, "moves": ["Earthquake", "Spikes"],
        })
        self.assertEqual(paste, "\n".join([
            "Garchomp @ Rocky Helmet", "Ability: Rough Skin", "Tera Type: Steel",
            "EVs: 252 HP / 4 Spe", "Impish Nature", "IVs: 0 SpA",
            "- Earthquake", "- Spikes",
        ]))

    @unittest.skipUnless((PS_DIR / "dist" / "config" / "formats.js").exists(), "Pokémon Showdown no está compilado.")
    def test_paridad_con_showdown(self):
        result = subprocess.run(
            ["node", str(PARITY_SCRIPT)], cwd=ROOT, text=True, capture_output=True,
            env={**os.environ, "BATS_PS_DIR": str(PS_DIR)},
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
