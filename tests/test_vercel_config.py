"""Configuración de Vercel para Arena (F0.6): la función Node del motor convive con la de Python.

Sin red ni base de datos: solo lee `vercel.json`, `.vercelignore` y el workflow de CI.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))


def _expand(patron: str) -> set[str]:
    """Expande llaves anidadas como lo hace el glob de Vercel: `{a,b}/x` -> {`a/x`, `b/x`}."""
    m = re.search(r"\{([^{}]*)\}", patron)
    if not m:
        return {patron}
    out: set[str] = set()
    for alt in m.group(1).split(","):
        out |= _expand(patron[: m.start()] + alt + patron[m.end():])
    return out


class TestVercelConfig(unittest.TestCase):

    def _index(self, source: str) -> int:
        sources = [r["source"] for r in CONFIG["rewrites"]]
        self.assertIn(source, sources)
        return sources.index(source)

    def test_rewrite_del_motor_va_antes_del_comodin_de_la_api(self):
        motor = self._index("/api/motor/(.*)")
        self.assertLess(motor, self._index("/api/(.*)"))
        self.assertEqual(CONFIG["rewrites"][motor]["destination"], "/api/motor")

    def test_la_spa_sigue_ultima_y_sin_capturar_api(self):
        self.assertEqual(CONFIG["rewrites"][-1]["source"], "/((?!api/).*)")

    def test_funcion_del_motor(self):
        self.assertEqual(CONFIG["functions"]["api/motor.ts"]["maxDuration"], 15)

    def test_el_bundle_de_python_no_arrastra_node(self):
        excluidos = _expand(CONFIG["functions"]["api/index.py"]["excludeFiles"])
        for patron in ("motor/**", "node_modules/**", "package*.json", "tsconfig.json",
                       "web/**", "tests/**", "bats_core/bot/**", "bats_core/cli.py"):
            self.assertIn(patron, excluidos)

    def test_excludefiles_cabe_en_el_limite_de_vercel(self):
        # Vercel rechaza el vercel.json entero si algún `excludeFiles` pasa de 256 caracteres.
        for ruta, cfg in CONFIG["functions"].items():
            for campo in ("excludeFiles", "includeFiles"):
                self.assertLessEqual(len(cfg.get(campo, "")), 256, f"{ruta}.{campo}")

    def test_region_junto_a_supabase(self):
        self.assertEqual(CONFIG["regions"], ["iad1"])

    def test_fluid_compute(self):
        self.assertIs(CONFIG["fluid"], True)

    def test_install_instala_raiz_y_web(self):
        self.assertEqual(CONFIG["installCommand"], "npm ci && cd web && npm ci")

    def test_los_tests_del_motor_no_se_suben(self):
        lineas = (ROOT / ".vercelignore").read_text(encoding="utf-8").splitlines()
        for ruta in ("motor/test/", "web/e2e/"):
            self.assertIn(ruta, lineas)

    def test_cron_intacto(self):
        self.assertEqual(CONFIG["crons"][0]["path"], "/api/cron/refresh-views")


if __name__ == "__main__":
    unittest.main()
