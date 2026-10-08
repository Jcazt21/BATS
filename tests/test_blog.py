"""
tests/test_blog.py
==================
Utilidades puras del blog (bats_core/blog.py): slug de la URL y extracto de la lista.
No necesitan base de datos.
"""
import unittest

from bats_core.blog import excerpt, slugify


class TestSlugify(unittest.TestCase):

    def test_quita_acentos_y_signos(self):
        self.assertEqual(slugify("¡Novedades de la Temporada 3!"), "novedades-de-la-temporada-3")
        self.assertEqual(slugify("Pokémon ñandú"), "pokemon-nandu")

    def test_sin_caracteres_validos_usa_fallback(self):
        self.assertEqual(slugify("!!! 🎉"), "entrada")
        self.assertEqual(slugify(""), "entrada")

    def test_largo_maximo_sin_guion_final(self):
        slug = slugify("palabra " * 50)
        self.assertLessEqual(len(slug), 100)
        self.assertFalse(slug.endswith("-"))


class TestExcerpt(unittest.TestCase):

    def test_omite_h1_igual_al_titulo(self):
        md = "# Novedades\n\nLa temporada arranca el lunes."
        self.assertEqual(excerpt(md, "Novedades"), "La temporada arranca el lunes.")

    def test_conserva_h1_distinto_al_titulo(self):
        self.assertEqual(excerpt("# Otra cosa\n\nTexto.", "Novedades"), "Otra cosa Texto.")

    def test_limpia_markdown(self):
        md = (
            "Lee **las reglas** en [la web](https://x.test) y _vota_.\n\n"
            "![sprite](https://x.test/a.png)\n\n"
            "```py\nprint('no')\n```\n\n"
            "| a | b |\n|---|---|\n| 1 | 2 |\n\n"
            "- uno\n- dos\n\n<b>html</b>"
        )
        self.assertEqual(excerpt(md), "Lee las reglas en la web y vota. a b 1 2 uno dos html")

    def test_corta_en_palabra_con_elipsis(self):
        out = excerpt("palabra " * 100, limit=30)
        self.assertTrue(out.endswith("…"))
        self.assertLessEqual(len(out), 31)
        self.assertNotIn("palabr…", out)

    def test_vacio(self):
        self.assertEqual(excerpt(""), "")
