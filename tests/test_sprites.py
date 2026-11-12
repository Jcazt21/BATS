"""
tests/test_sprites.py
=====================
Sprites servidos por el API (/api/sprites), en sus dos estilos (3d y gen5). La red se simula:
ningún test llega a Showdown. No necesita base de datos.
"""
import unittest
from unittest import mock

from fastapi.testclient import TestClient

from bats_core.api.main import app
from bats_core.api.routes import sprites

# Tabla 3D: scizormega y weavile animan; obscuro solo tiene PNG.
TABLE_3D = (
    "exports.BattlePokemonSprites = {\n"
    "\tscizormega:{num:212,front:{w:79,h:103},back:{w:70,h:104}},\n"
    "\tobscuro:{num:1017},\n"
    "\tweavile:{num:461,front:{w:62,h:78},frontf:{w:62,h:78},back:{w:68,h:83},backf:{w:56,h:77}},\n"
    "};\n"
)
# Tabla Gen 5: obscuro no anima en ninguno; scizormega tiene otro tamaño de GIF.
TABLE_G5 = (
    "exports.BattlePokemonSpritesBW = {\n"
    "\tscizormega:{num:212,front:{w:92,h:82},back:{w:96,h:96}},\n"
    "\tobscuro:{num:1017},\n"
    "};\n"
)
GIF3, PNG3, GIF5, PNG5 = b"GIF89a-3d", b"\x89PNG-3d", b"GIF89a-g5", b"\x89PNG-g5"

FILES = {
    "/data/pokedex-mini.js": TABLE_3D.encode(),
    "/data/pokedex-mini-bw.js": TABLE_G5.encode(),
    "/sprites/ani/scizor-mega.gif": GIF3,
    "/sprites/dex/scizor-mega.png": PNG3,
    "/sprites/dex/obscuro.png": PNG3,
    "/sprites/gen5ani/scizor-mega.gif": GIF5,
    "/sprites/gen5/scizor-mega.png": PNG5,
    "/sprites/gen5/obscuro.png": PNG5,
}  # weavile: la tabla dice que anima pero no hay GIF ni PNG (404 simulado)


def fake_download(url: str):
    return FILES.get(url.removeprefix("https://play.pokemonshowdown.com"))


class TestParseTable(unittest.TestCase):
    def test_solo_las_entradas_con_front_tienen_animacion(self):
        t = sprites.parse_table(TABLE_3D)
        self.assertEqual(t["scizormega"], (79, 103))
        self.assertEqual(t["weavile"], (62, 78))
        self.assertIsNone(t["obscuro"])
        self.assertEqual(set(t), {"scizormega", "obscuro", "weavile"})

    def test_texto_vacio_o_sin_formato(self):
        self.assertEqual(sprites.parse_table(""), {})
        self.assertEqual(sprites.parse_table("nada que ver"), {})


class TestSpritesApi(unittest.TestCase):
    def setUp(self):
        sprites._reset_cache()
        patcher = mock.patch.object(sprites, "_download", side_effect=fake_download)
        self.download = patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)

    # ── info ────────────────────────────────────────────────────────────────
    def test_info_3d_por_defecto(self):
        r = self.client.get("/api/sprites/scizor-mega/info")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"animated": True, "width": 79, "height": 103})

    def test_info_gen5_tiene_su_propio_tamano(self):
        r = self.client.get("/api/sprites/scizor-mega/info?style=gen5")
        self.assertEqual(r.json(), {"animated": True, "width": 92, "height": 82})

    def test_info_sin_animacion_usa_el_tamano_del_estatico_de_cada_estilo(self):
        self.assertEqual(self.client.get("/api/sprites/obscuro/info").json(), {"animated": False, "width": 120, "height": 120})
        self.assertEqual(self.client.get("/api/sprites/obscuro/info?style=gen5").json(), {"animated": False, "width": 96, "height": 96})

    def test_info_de_una_especie_desconocida_es_404(self):
        self.assertEqual(self.client.get("/api/sprites/missingno/info").status_code, 404)

    def test_style_invalido_es_422(self):
        self.assertEqual(self.client.get("/api/sprites/scizor-mega/info?style=hd").status_code, 422)
        self.assertEqual(self.client.get("/api/sprites/scizor-mega?style=hd").status_code, 422)

    def test_spriteid_invalido_es_400(self):
        for malo in ("../x", "A" * 41, "a%2Fb", "esp ace"):
            r = self.client.get(f"/api/sprites/{malo}/info")
            self.assertIn(r.status_code, (400, 404), malo)
        self.assertEqual(self.client.get("/api/sprites/UPPER/info").status_code, 400)

    # ── imagen ──────────────────────────────────────────────────────────────
    def test_imagen_3d_animada_cuando_existe(self):
        r = self.client.get("/api/sprites/scizor-mega")
        self.assertEqual((r.status_code, r.headers["content-type"], r.content), (200, "image/gif", GIF3))
        self.assertIn("s-maxage", r.headers["cache-control"])

    def test_imagen_gen5_usa_sus_carpetas(self):
        r = self.client.get("/api/sprites/scizor-mega?style=gen5")
        self.assertEqual((r.headers["content-type"], r.content), ("image/gif", GIF5))
        r = self.client.get("/api/sprites/scizor-mega?style=gen5&still=1")
        self.assertEqual((r.headers["content-type"], r.content), ("image/png", PNG5))

    def test_still_fuerza_el_png(self):
        r = self.client.get("/api/sprites/scizor-mega?still=1")
        self.assertEqual((r.headers["content-type"], r.content), ("image/png", PNG3))

    def test_sin_animacion_sirve_el_png(self):
        r = self.client.get("/api/sprites/obscuro")
        self.assertEqual((r.headers["content-type"], r.content), ("image/png", PNG3))

    def test_si_no_hay_gif_ni_png_es_404(self):
        self.assertEqual(self.client.get("/api/sprites/weavile").status_code, 404)

    # ── tablas ──────────────────────────────────────────────────────────────
    def test_cada_tabla_se_descarga_una_sola_vez(self):
        for _ in range(3):
            self.client.get("/api/sprites/scizor-mega/info")
            self.client.get("/api/sprites/scizor-mega/info?style=gen5")
        urls = [c.args[0] for c in self.download.call_args_list]
        self.assertEqual(sum(u.endswith("/pokedex-mini.js") for u in urls), 1)
        self.assertEqual(sum(u.endswith("/pokedex-mini-bw.js") for u in urls), 1)

    def test_sin_tabla_no_se_inventa_animacion(self):
        sprites._reset_cache()
        with mock.patch.object(sprites, "_download", side_effect=lambda u: PNG3 if u.endswith(".png") else None):
            r = self.client.get("/api/sprites/scizor-mega/info")
            self.assertEqual(r.json()["animated"], False)
            self.assertEqual(self.client.get("/api/sprites/scizor-mega").content, PNG3)


if __name__ == "__main__":
    unittest.main()
