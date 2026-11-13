"""Forma reciente y racha (bats_core/api/form.py): funciones puras, sin DB."""
from bats_core.api.form import form, result_for, streak


def test_streak_cuenta_iguales_desde_la_mas_reciente():
    assert streak(["W", "W", "L"]) == {"type": "W", "length": 2}


def test_streak_el_empate_corta_la_racha():
    assert streak(["T", "W"]) == {"type": "T", "length": 1}


def test_streak_sin_batallas():
    assert streak([]) == {"type": None, "length": 0}


def test_form_ultimas_cinco_de_la_mas_vieja_a_la_mas_nueva():
    assert form(["W", "L", "T", "W", "W", "L", "L"]) == ["W", "W", "T", "L", "W"]


def test_form_con_menos_de_cinco():
    assert form(["L"]) == ["L"]
    assert form([]) == []


def test_result_for():
    assert result_for(None, 3) == "T"
    assert result_for(3, 3) == "W"
    assert result_for(4, 3) == "L"
