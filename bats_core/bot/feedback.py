"""
bats_core/bot/feedback.py
====================
Rastrea eventos durante la batalla y genera un análisis post-partida
que el bot envía como PM al jugador al terminar.

El tracker se crea una vez por batalla y se actualiza en cada turno
desde player.py. Al finalizar la batalla, genera_feedback() produce
el mensaje de texto listo para enviar.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from poke_env.battle import AbstractBattle as Battle, Pokemon


# ─── Tracker por batalla ──────────────────────────────────────────────────────

@dataclass
class BattleFeedback:
    """
    Acumula datos de una batalla para generar feedback al final.

    Actualizar en cada llamada a choose_move:
      - snapshot_turn(battle): registra el estado del turno actual.

    Al terminar la batalla:
      - generate(battle): retorna el string de feedback.
    """

    # HP fraccional al inicio de cada turno: {species: hp_fraction}
    _prev_our_hp: dict[str, float] = field(default_factory=dict)
    _prev_opp_hp: dict[str, float] = field(default_factory=dict)

    # Daño acumulado infligido a cada Pokemon rival (suma de drops de HP)
    damage_dealt: dict[str, float] = field(default_factory=dict)

    # Daño acumulado recibido por cada nuestro Pokemon
    damage_taken: dict[str, float] = field(default_factory=dict)

    # KOs que dimos y recibimos: {species: count}
    our_kos: dict[str, int] = field(default_factory=dict)
    their_kos: dict[str, int] = field(default_factory=dict)

    # Turnos que cada nuestro Pokemon estuvo en campo
    our_turns_active: dict[str, int] = field(default_factory=dict)
    _our_entry_turn: dict[str, int] = field(default_factory=dict)

    # Pokemon rival que más veces se mantuvo en campo (indicador de amenaza)
    opp_turns_active: dict[str, int] = field(default_factory=dict)
    _opp_entry_turn: dict[str, int] = field(default_factory=dict)

    current_turn: int = 0

    def snapshot_turn(self, battle: "Battle") -> None:
        """
        Llama al inicio de cada choose_move para registrar cambios de HP
        y detectar KOs comparando con el snapshot anterior.
        """
        self.current_turn = battle.turn

        # ── Nuestro equipo ────────────────────────────────────────────────────
        for species, mon in battle.team.items():
            name = mon.species
            cur_hp = mon.current_hp_fraction if not mon.fainted else 0.0

            # Registrar entrada al campo
            if battle.active_pokemon and battle.active_pokemon.species == name:
                if name not in self._our_entry_turn:
                    self._our_entry_turn[name] = self.current_turn
                self.our_turns_active[name] = (
                    self.current_turn - self._our_entry_turn[name] + 1
                )

            # Calcular daño recibido
            if name in self._prev_our_hp:
                drop = self._prev_our_hp[name] - cur_hp
                if drop > 0:
                    self.damage_taken[name] = self.damage_taken.get(name, 0.0) + drop

            # Detectar KO recibido
            if name in self._prev_our_hp and self._prev_our_hp[name] > 0 and cur_hp == 0:
                # El oponente activo fue quien lo KOeó
                if battle.opponent_active_pokemon:
                    opp_name = battle.opponent_active_pokemon.species
                    self.their_kos[opp_name] = self.their_kos.get(opp_name, 0) + 1

            self._prev_our_hp[name] = cur_hp

        # ── Equipo rival ──────────────────────────────────────────────────────
        for species, mon in battle.opponent_team.items():
            name = mon.species
            cur_hp = mon.current_hp_fraction if not mon.fainted else 0.0

            # Registrar entrada al campo
            if battle.opponent_active_pokemon and battle.opponent_active_pokemon.species == name:
                if name not in self._opp_entry_turn:
                    self._opp_entry_turn[name] = self.current_turn
                self.opp_turns_active[name] = (
                    self.current_turn - self._opp_entry_turn[name] + 1
                )

            # Calcular daño infligido
            if name in self._prev_opp_hp:
                drop = self._prev_opp_hp[name] - cur_hp
                if drop > 0:
                    self.damage_dealt[name] = self.damage_dealt.get(name, 0.0) + drop

            # Detectar KO dado
            if name in self._prev_opp_hp and self._prev_opp_hp[name] > 0 and cur_hp == 0:
                if battle.active_pokemon:
                    our_name = battle.active_pokemon.species
                    self.our_kos[our_name] = self.our_kos.get(our_name, 0) + 1

            self._prev_opp_hp[name] = cur_hp

    def generate(self, battle: "Battle") -> str:
        """
        Genera el mensaje de feedback para enviar como PM al jugador.

        Retorna un string multilínea con el análisis de la batalla.
        """
        won = battle.won
        turns = battle.turn
        opponent = battle.opponent_username or "Oponente"

        lines: list[str] = [
            f"--- Análisis PGL-Bot vs {opponent} ---",
            f"Resultado: {'Victoria del bot' if won else 'Victoria tuya'} en {turns} turnos",
            "",
        ]

        # ── Nuestro MVP (el que más KOs hizo) ────────────────────────────────
        if self.our_kos:
            our_mvp = max(self.our_kos, key=lambda k: self.our_kos[k])
            lines.append(f"Mi MVP: {our_mvp} ({self.our_kos[our_mvp]} KOs)")
        else:
            lines.append("Mi MVP: ninguno hizo KOs directos")

        # ── Tu Pokemon más peligroso (más KOs sobre mi equipo) ────────────────
        if self.their_kos:
            their_mvp = max(self.their_kos, key=lambda k: self.their_kos[k])
            lines.append(
                f"Tu mayor amenaza: {their_mvp} ({self.their_kos[their_mvp]} KOs sobre mi equipo)"
            )
        else:
            lines.append("Tu mayor amenaza: ninguno llegó a hacer KOs")

        lines.append("")

        # ── Pokemon que más daño recibimos ────────────────────────────────────
        if self.damage_taken:
            most_hurt = max(self.damage_taken, key=lambda k: self.damage_taken[k])
            pct = round(self.damage_taken[most_hurt] * 100)
            lines.append(f"El que más daño recibió en mi equipo: {most_hurt} ({pct}% de HP total perdido)")

        # ── Pokemon rival al que más daño hicimos ─────────────────────────────
        if self.damage_dealt:
            most_damaged = max(self.damage_dealt, key=lambda k: self.damage_dealt[k])
            pct = round(self.damage_dealt[most_damaged] * 100)
            lines.append(f"Al que más daño le hice: {most_damaged} ({pct}% de HP total)")

        lines.append("")

        # ── Conteo de supervivientes ──────────────────────────────────────────
        our_survivors = [
            mon.species for mon in battle.team.values() if not mon.fainted
        ]
        their_survivors = [
            mon.species for mon in battle.opponent_team.values() if not mon.fainted
        ]

        lines.append(
            f"Mis sobrevivientes ({len(our_survivors)}): "
            + (", ".join(our_survivors) if our_survivors else "ninguno")
        )
        lines.append(
            f"Tus sobrevivientes ({len(their_survivors)}): "
            + (", ".join(their_survivors) if their_survivors else "ninguno")
        )

        lines.append("")

        # ── Tip contextual ────────────────────────────────────────────────────
        if self.their_kos:
            mvp = max(self.their_kos, key=lambda k: self.their_kos[k])
            lines.append(
                f"Tip: Tu {mvp} fue clave. Considera si tu equipo tiene una respuesta sólida a ese Pokemon."
            )
        elif not won:
            lines.append("Tip: Ganaste sin que yo hiciera KOs. Buen control de la batalla.")
        else:
            lines.append("Tip: Considera reforzar la presión ofensiva de tu equipo.")

        lines.append("--- Fin del análisis ---")

        return "\n".join(lines)
