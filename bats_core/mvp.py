"""
bats_core/mvp.py
================
Fórmula MVP única de BATS.

    mvp = (kills × 2) + survived + final_hit + min(turns_active, TURNS_CAP) × TURN_WEIGHT

- Los KOs mandan; sobrevivir y dar el golpe final suman 1 cada uno.
- Los turnos en campo reconocen la longevidad, pero con tope: un pokémon defensivo
  que aguanta 20 turnos ya no puntúa más que uno con 10 KOs (antes: turns_active
  sin acotar).
- Un pokémon de banca (was_active = False) puntúa 0.

La DB la calcula sola: `fact_pokemon_performance.mvp_score` es una columna
GENERADA a partir de `battle.mvp_score()` (migración v10.sql). Esta función es su
espejo en Python (análisis en memoria); `tests/test_mvp.py` comprueba que ambas
coinciden. Si cambias las constantes, cambia también v10.sql.
"""

TURNS_CAP = 8
TURN_WEIGHT = 0.25


def mvp_score(kills: int, turns_active: int, survived: bool, final_hit: bool, was_active: bool = True) -> float:
    if not was_active:
        return 0.0
    return float(
        kills * 2
        + (1 if survived else 0)
        + (1 if final_hit else 0)
        + min(turns_active, TURNS_CAP) * TURN_WEIGHT
    )
