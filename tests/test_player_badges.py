"""
tests/test_player_badges.py
===========================
Las insignias del carnet del inicio se calculan en el servidor (el front solo las pinta).
Estas pruebas no necesitan base de datos: ejercitan las funciones puras de players.py.
"""
import unittest

from bats_core.api.routes.players import _badges, _best_win_streak


class TestBestWinStreak(unittest.TestCase):
    def test_vacio(self):
        self.assertEqual(_best_win_streak([]), 0)

    def test_sin_victorias(self):
        self.assertEqual(_best_win_streak([False, False]), 0)

    def test_mejor_racha_no_es_la_actual(self):
        # V V V D V → la mejor es 3 aunque la actual sea 1.
        self.assertEqual(_best_win_streak([True, True, True, False, True]), 3)

    def test_todo_victorias(self):
        self.assertEqual(_best_win_streak([True] * 5), 5)


class TestBadges(unittest.TestCase):
    @staticmethod
    def _earned(**kw):
        return {b["id"]: b["earned"] for b in _badges(**kw)}

    def test_orden_y_glifos_fijos(self):
        out = _badges(0, 0, False)
        self.assertEqual([b["id"] for b in out], ["first_win", "streak_3", "mvp", "streak_5"])
        self.assertEqual([b["glyph"] for b in out], ["★", "3×", "M", "5×"])
        self.assertTrue(all(b["label"] for b in out))

    def test_nuevo_jugador_no_tiene_ninguna(self):
        self.assertFalse(any(self._earned(wins=0, best_streak=0, is_mvp_leader=False).values()))

    def test_umbrales(self):
        e = self._earned(wins=1, best_streak=2, is_mvp_leader=False)
        self.assertEqual((e["first_win"], e["streak_3"], e["streak_5"]), (True, False, False))
        e = self._earned(wins=9, best_streak=3, is_mvp_leader=True)
        self.assertEqual((e["streak_3"], e["streak_5"], e["mvp"]), (True, False, True))
        self.assertTrue(self._earned(wins=9, best_streak=5, is_mvp_leader=False)["streak_5"])


if __name__ == "__main__":
    unittest.main()
