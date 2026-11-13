"""
BATS — Forma reciente y racha de un jugador.

Resultado de un jugador en una batalla: "W" (ganó), "L" (perdió) o "T" (empate: la batalla
terminó sin ganador, fact_battles.winner_id IS NULL). La UI los muestra como V / D / E.
"""
from typing import Literal, Optional

Result = Literal["W", "L", "T"]


def result_for(winner_id: Optional[int], player_id: int) -> Result:
    if winner_id is None:
        return "T"
    return "W" if winner_id == player_id else "L"


def form(results_newest_first: list[Result], n: int = 5) -> list[Result]:
    """Últimos `n` resultados, de la más vieja a la más nueva (la más reciente queda a la derecha)."""
    return list(reversed(results_newest_first[:n]))


def streak(results_newest_first: list[Result]) -> dict:
    """Racha actual: resultados iguales seguidos desde la batalla más reciente. Un empate corta la racha."""
    if not results_newest_first:
        return {"type": None, "length": 0}
    first, length = results_newest_first[0], 0
    for r in results_newest_first:
        if r != first:
            break
        length += 1
    return {"type": first, "length": length}
