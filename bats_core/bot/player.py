"""
bats_core/bot/player.py
==================
PGLPlayer — AI competitiva máxima para [Gen 9] PinchesGueys League.

Nivel de dificultad: Extremo

Análisis por turno:
  1.  Damage estimation real (fórmula Gen 9 + burn, Life Orb, Band/Specs, Huge Power)
  2.  KO check bidireccional — ¿puedo matar? ¿me pueden matar?
  3.  Speed tier preciso (Choice Scarf, parálisis, Trick Room, Tailwind)
  4.  Setup awareness — detecta boosts del rival y prioriza romperlos
  5.  Move scoring — pondera BP + efectividad + STAB + situación de juego
  6.  Switch inteligente — evalúa contra TODO el equipo rival revelado
  7.  Hazard entry damage — descuenta daño de entrada al evaluar switches
  8.  Terastal inteligente — activa en el momento óptimo (STAB 2.0x correcto)
  9.  Weather/terrain modifier — considera efectos de campo en daño y defensa
  10. Ability immunities — Levitate, Flash Fire, Storm Drain, etc.
  11. Choice lock tracking — detecta rival locked usando _last_opp_move real
  12. Win condition awareness — identifica y preserva el Pokémon clave
  13. Endgame logic — ajusta scoring en escenarios 1v1 y últimos Pokémon
  14. Predicción de switch — bonus a pivot moves en matchup desfavorable
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from poke_env.battle import (
    AbstractBattle,
    Move,
    Pokemon,
    PokemonType,
    MoveCategory,
    Effect,
    Field,
    SideCondition,
    Status,
    Weather,
)
from poke_env.player import SimpleHeuristicsPlayer, BattleOrder
from poke_env.data import GenData

from .feedback import BattleFeedback

logger = logging.getLogger(__name__)

# ─── Constantes ───────────────────────────────────────────────────────────────

LEVEL = 100
KO_THRESHOLD          = 1.0
CRIT_KO_THRESHOLD     = 0.85  # ≥85% de daño restante → intentar KO
SWITCH_THREAT_THRESHOLD = 0.85  # rival puede hacernos ≥85% → switch
TERA_OFFENSIVE_THRESHOLD = 0.90  # con Tera podemos hacer ≥90% → activar

SETUP_MOVES = {
    "swordsdance", "dragondance", "nastyplot", "calmmind", "quiverdance",
    "irondefense", "acidarmor", "agility", "shellsmash", "tidyup",
    "victorydance", "bulkup", "coil", "workup",
}
TRUE_PRIORITY = {
    "aquajet", "suckerpunch", "extremespeed", "shadowsneak",
    "bulletpunch", "machpunch", "iceshard", "quickattack",
    "accelerock", "vacuumwave",
}
RECOVERY_MOVES = {
    "recover", "roost", "slackoff", "morningsun", "synthesis",
    "moonlight", "softboiled", "wish", "healorder", "junglehealing",
    "milkdrink", "shoreup",
}
HAZARD_MOVES  = {"stealthrock", "spikes", "toxicspikes", "stickyweb"}
STATUS_MOVES  = {"thunderwave", "willowisp", "toxic", "spore", "sleeppowder", "nuzzle"}
PHAZING_MOVES = {"roar", "whirlwind", "dragontail", "circlethrow"}
PIVOT_MOVES   = {"uturn", "voltswitch", "flipturn", "chillyreception", "teleport"}

# Items relevantes
CHOICE_ITEMS = {"choicescarf", "choiceband", "choicespecs"}

# Habilidades que doblan la stat de ataque
DOUBLE_ATTACK_ABILITIES = {"hugepower", "purepower"}

# Habilidades que generan inmunidad a ciertos tipos de movimientos
ABILITY_IMMUNITIES: dict[str, set[PokemonType]] = {
    "levitate":     {PokemonType.GROUND},
    "flashfire":    {PokemonType.FIRE},
    "stormdrain":   {PokemonType.WATER},
    "lightningrod": {PokemonType.ELECTRIC},
    "motordrive":   {PokemonType.ELECTRIC},
    "sapsipper":    {PokemonType.GRASS},
    "waterabsorb":  {PokemonType.WATER},
    "voltabsorb":   {PokemonType.ELECTRIC},
    "eartheater":   {PokemonType.GROUND},
    "dryskin":      {PokemonType.WATER},
}

GEN_DATA = GenData.from_gen(9)


# ─── Helpers de stat ──────────────────────────────────────────────────────────

def _get_stat(mon: Pokemon, stat: str, fallback: int = 100) -> int:
    """Retorna el stat real si disponible, o estimación con 252 EVs, nature neutra."""
    if mon.stats:
        val = mon.stats.get(stat)
        if val is not None:
            return val
    if mon.base_stats:
        base = mon.base_stats.get(stat)
        if base is not None:
            if stat == "hp":
                return int((2 * base + 31 + 63) * LEVEL / 100 + LEVEL + 10)
            return int(((2 * base + 31 + 63) * LEVEL / 100 + 5))
    return fallback


def _apply_boost(stat_val: Optional[int], boost: Optional[int], fallback: int = 100) -> int:
    """Aplica modificador de boost (+1 a +6 / -6 a -1)."""
    if stat_val is None:
        stat_val = fallback
    boost = int(boost) if boost is not None else 0
    if boost == 0:
        return stat_val
    if boost > 0:
        return int(stat_val * (2 + boost) / 2)
    return int(stat_val * 2 / (2 - boost))


def _check_ability_immunity(move: Move, defender: Pokemon) -> bool:
    """True si la habilidad del defensor lo hace inmune al tipo del movimiento."""
    if not defender.ability:
        return False
    immune_types = ABILITY_IMMUNITIES.get(defender.ability, set())
    return move.type in immune_types


# ─── Modificadores de campo ───────────────────────────────────────────────────

def _weather_modifier(move: Move, attacker: Pokemon, defender: Pokemon,
                      battle: AbstractBattle, is_physical: bool) -> tuple[float, float]:
    """
    Retorna (atk_modifier, def_modifier) por clima.
    - Sunny: Fire ×1.5 atk, Water ×0.5 atk
    - Rain: Water ×1.5 atk, Fire ×0.5 atk
    - Sand: Rock-types +1.5× SpDef
    - Snow: Ice-types +1.5× Def
    """
    weather = battle.weather
    if not weather:
        return 1.0, 1.0
    w = next(iter(weather), None)
    if w is None:
        return 1.0, 1.0

    atk_mod = 1.0
    def_mod = 1.0

    if w == Weather.SUNNYDAY:
        if move.type == PokemonType.FIRE:
            atk_mod = 1.5
        elif move.type == PokemonType.WATER:
            atk_mod = 0.5
    elif w in (Weather.RAINDANCE, Weather.PRIMORDIALSEA):
        if move.type == PokemonType.WATER:
            atk_mod = 1.5
        elif move.type == PokemonType.FIRE:
            atk_mod = 0.5
    elif w == Weather.SANDSTORM:
        if not is_physical and PokemonType.ROCK in defender.types:
            def_mod = 1.5
    elif w == Weather.SNOWSCAPE:
        if is_physical and PokemonType.ICE in defender.types:
            def_mod = 1.5

    return atk_mod, def_mod


def _terrain_modifier(move: Move, battle: AbstractBattle) -> float:
    """Modificador de terreno (solo afecta a Pokémon en suelo)."""
    field = battle.fields
    if not field:
        return 1.0
    for f in field:
        if f == Field.ELECTRIC_TERRAIN and move.type == PokemonType.ELECTRIC:
            return 1.3
        if f == Field.GRASSY_TERRAIN and move.type == PokemonType.GRASS:
            return 1.3
        if f == Field.PSYCHIC_TERRAIN and move.type == PokemonType.PSYCHIC:
            return 1.3
        if f == Field.MISTY_TERRAIN and move.type == PokemonType.DRAGON:
            return 0.5
    return 1.0


# ─── Cálculo de daño ─────────────────────────────────────────────────────────

@dataclass
class DamageResult:
    fraction:      float
    move:          Move
    effectiveness: float
    stab:          bool
    tera_boost:    bool = False


def estimate_damage_fraction(
    move: Move,
    attacker: Pokemon,
    defender: Pokemon,
    battle: Optional[AbstractBattle] = None,
    attacker_tera: bool = False,
) -> DamageResult:
    """
    Estima el daño de un movimiento como fracción del HP máximo del defensor.

    Incluye: burn halving, Life Orb, Choice Band/Specs, Huge Power/Pure Power,
    Sandstorm SpDef boost, Snow Def boost, Tera STAB 2.0x, ability immunities,
    weather y terrain modifiers.
    """
    if move.base_power <= 0:
        return DamageResult(0.0, move, 1.0, False)

    # Comprobar inmunidad por habilidad antes que tipo
    if _check_ability_immunity(move, defender):
        return DamageResult(0.0, move, 0.0, False)

    effectiveness = defender.damage_multiplier(move)
    if effectiveness == 0:
        return DamageResult(0.0, move, 0.0, False)

    is_physical = move.category == MoveCategory.PHYSICAL
    atk_stat    = "atk" if is_physical else "spa"
    def_stat    = "def" if is_physical else "spd"

    raw_atk = _get_stat(attacker, atk_stat, 150)
    raw_def = _get_stat(defender,  def_stat, 130)

    # Boosts de atacante y defensor
    atk_boost = attacker.boosts.get(atk_stat, 0) if attacker.boosts else 0
    def_boost = defender.boosts.get(def_stat, 0)  if defender.boosts else 0

    # Habilidades que doblan el ataque (Huge Power / Pure Power)
    if attacker.ability in DOUBLE_ATTACK_ABILITIES and is_physical:
        raw_atk *= 2

    attack  = _apply_boost(raw_atk, atk_boost) or 1
    defense = _apply_boost(raw_def, def_boost) or 1

    # Burn: reduce ATK física a la mitad
    if attacker.status == Status.BRN and is_physical:
        attack = attack // 2

    # Choice Band (+50% ATK física) / Choice Specs (+50% SpAtk)
    if is_physical and attacker.item == "choiceband":
        attack = int(attack * 1.5)
    elif not is_physical and attacker.item == "choicespecs":
        attack = int(attack * 1.5)

    # Modificador de clima (ataque y defensa)
    atk_weather_mod, def_weather_mod = (
        _weather_modifier(move, attacker, defender, battle, is_physical)
        if battle else (1.0, 1.0)
    )
    attack  = int(attack  * atk_weather_mod)
    defense = int(defense * def_weather_mod) or 1

    # Modificador de terreno
    terrain_mod = _terrain_modifier(move, battle) if battle else 1.0

    # Fórmula Gen 9
    base = ((2 * LEVEL / 5 + 2) * move.base_power * attack / defense) / 50 + 2

    # STAB con Tera — Gen 9: si el Tera type coincide con tipo original → 2.0x
    stab      = False
    tera_boost = False
    stab_mult  = 1.0

    if attacker_tera and attacker.tera_type:
        if move.type == attacker.tera_type:
            tera_boost = True
            stab       = True
            stab_mult  = 2.0 if move.type in attacker.types else 1.5
        elif move.type in attacker.types:
            # STAB original preservado aunque no sea el Tera type
            stab      = True
            stab_mult = 1.5
    else:
        stab      = move.type in attacker.types
        stab_mult = 1.5 if stab else 1.0

    raw_damage = base * stab_mult * effectiveness * terrain_mod

    # Life Orb: +30% de daño
    if attacker.item == "lifeorb":
        raw_damage *= 1.3

    # HP máximo del defensor
    max_hp = defender.max_hp if (defender.max_hp and defender.max_hp > 0) \
             else _get_stat(defender, "hp", 350)

    fraction = raw_damage / max_hp
    return DamageResult(
        fraction=fraction, move=move,
        effectiveness=effectiveness, stab=stab, tera_boost=tera_boost,
    )


# ─── Speed tier ──────────────────────────────────────────────────────────────

def _we_outspeed(attacker: Pokemon, defender: Pokemon,
                 battle: Optional[AbstractBattle] = None) -> bool:
    """
    True si el atacante mueve antes que el defensor.
    Considera: stat base, boosts, Choice Scarf, parálisis, Tailwind, Trick Room.
    """
    our_spe = _get_stat(attacker, "spe", 100)
    opp_spe = _get_stat(defender,  "spe", 100)

    our_boost = attacker.boosts.get("spe", 0) if attacker.boosts else 0
    opp_boost = defender.boosts.get("spe",  0) if defender.boosts else 0

    our_spe = _apply_boost(our_spe, our_boost)
    opp_spe = _apply_boost(opp_spe, opp_boost)

    # Choice Scarf ×1.5
    if attacker.item == "choicescarf":
        our_spe = int(our_spe * 1.5)
    if defender.item == "choicescarf":
        opp_spe = int(opp_spe * 1.5)

    # Parálisis → speed ÷2
    if attacker.status == Status.PAR:
        our_spe = our_spe // 2
    if defender.status == Status.PAR:
        opp_spe = opp_spe // 2

    if battle:
        # Tailwind ×2 para el lado correspondiente
        if SideCondition.TAILWIND in battle.side_conditions:
            our_spe *= 2
        if SideCondition.TAILWIND in battle.opponent_side_conditions:
            opp_spe *= 2

        # Trick Room invierte el orden
        if Field.TRICK_ROOM in battle.fields:
            return our_spe < opp_spe

    return our_spe > opp_spe


# ─── Player ───────────────────────────────────────────────────────────────────

class PGLPlayer(SimpleHeuristicsPlayer):
    """
    Bot competitivo de dificultad extrema para [Gen 9] PinchesGueys League.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._feedback_trackers: dict[str, BattleFeedback] = {}
        # {battle_tag: {species: set(move_ids)}} — moves revelados por especie
        self._revealed_moves: dict[str, dict[str, set]] = {}
        # {battle_tag: {species: set(move_ids)}} — snapshot del turno anterior
        self._prev_opp_moves: dict[str, dict[str, set]] = {}
        # {battle_tag: move_id} — último movimiento usado por el rival activo
        self._last_opp_move: dict[str, Optional[str]] = {}
        # {battle_tag: bool} — Tera usada en esta batalla
        self._tera_used: dict[str, bool] = {}

    # ── Punto de entrada ──────────────────────────────────────────────────────

    def choose_move(self, battle: AbstractBattle) -> BattleOrder:
        tracker = self._get_tracker(battle)
        tracker.snapshot_turn(battle)
        self._track_opponent_moves(battle)

        order = self._analyze_and_choose(battle)
        if order is not None:
            return order
        return super().choose_move(battle)

    # ── Tracking del rival ────────────────────────────────────────────────────

    def _track_opponent_moves(self, battle: AbstractBattle) -> None:
        """
        Registra los movimientos revelados por el rival y actualiza _last_opp_move
        comparando el estado actual vs el del turno anterior.
        """
        tag = battle.battle_tag
        if tag not in self._revealed_moves:
            self._revealed_moves[tag] = {}
        if tag not in self._prev_opp_moves:
            self._prev_opp_moves[tag] = {}

        opp = battle.opponent_active_pokemon
        if opp is None:
            return

        name = opp.species
        current_moves = set(opp.moves.keys())
        prev_moves    = self._prev_opp_moves[tag].get(name, set())

        # Movimientos nuevos revelados este turno = move que acaban de usar
        new_moves = current_moves - prev_moves
        if new_moves:
            self._last_opp_move[tag] = next(iter(new_moves))
        elif len(current_moves) == 1:
            # Solo conocen un move y no hay novedad → lo volvieron a usar
            self._last_opp_move[tag] = next(iter(current_moves))
        # Si tienen >1 move conocido y no hay novedad, mantenemos el último registrado

        # Actualizar snapshots
        self._prev_opp_moves[tag][name] = current_moves
        self._revealed_moves[tag][name] = current_moves

    def _opp_revealed_moves(self, battle: AbstractBattle) -> set[str]:
        """Movimientos conocidos del rival activo."""
        tag = battle.battle_tag
        opp = battle.opponent_active_pokemon
        if opp is None or tag not in self._revealed_moves:
            return set()
        return self._revealed_moves[tag].get(opp.species, set())

    def _opp_might_be_choice_locked(self, battle: AbstractBattle) -> Optional[str]:
        """
        Retorna el move ID si el rival está locked en un movimiento Choice.
        Usa _last_opp_move para detección precisa; cae a count==1 como fallback.
        """
        opp = battle.opponent_active_pokemon
        if opp is None:
            return None
        # Comparación exacta de item IDs (no fragile string search)
        if opp.item not in CHOICE_ITEMS:
            return None

        tag = battle.battle_tag
        last = self._last_opp_move.get(tag)
        if last:
            return last

        # Fallback: solo 1 move revelado
        revealed = self._opp_revealed_moves(battle)
        if len(revealed) == 1:
            return next(iter(revealed))
        return None

    def _tera_available(self, battle: AbstractBattle) -> bool:
        tag = battle.battle_tag
        if self._tera_used.get(tag, False):
            return False
        return battle.can_tera is not None and battle.can_tera

    # ── Win condition ─────────────────────────────────────────────────────────

    def _identify_win_condition(self, battle: AbstractBattle) -> Optional[Pokemon]:
        """
        Identifica el Pokémon de nuestro equipo que puede ganar más matchups
        contra los rivales restantes (tipo neutral o favorable + HP decente).
        Solo cuenta si puede ganar ≥2 matchups.
        """
        opp_remaining = [m for m in battle.opponent_team.values() if not m.fainted]
        if not opp_remaining:
            return None

        chart = GEN_DATA.type_chart
        best_mon   = None
        best_count = 0

        for mon in battle.team.values():
            if mon.fainted or mon.current_hp_fraction < 0.4:
                continue
            count = 0
            for opp in opp_remaining:
                best_mult = 0.0
                for mon_type in mon.types:
                    if mon_type is None:
                        continue
                    mult = 1.0
                    for opp_type in opp.types:
                        if opp_type is None:
                            continue
                        # chart[defending][attacking] → mon ataca opp: chart[opp_type][mon_type]
                        if opp_type.name in chart and mon_type.name in chart[opp_type.name]:
                            mult *= chart[opp_type.name][mon_type.name]
                    best_mult = max(best_mult, mult)
                if best_mult >= 1.0:
                    count += 1
            if count > best_count:
                best_count = count
                best_mon = mon

        return best_mon if best_count >= 2 else None

    # ── Análisis principal ────────────────────────────────────────────────────

    def _analyze_and_choose(self, battle: AbstractBattle) -> Optional[BattleOrder]:
        active   = battle.active_pokemon
        opponent = battle.opponent_active_pokemon

        # ── Forced switch (el nuestro murió — elegimos el siguiente) ──────────
        if active is None and opponent is not None:
            switches = list(battle.available_switches)
            if switches:
                best = self._find_best_switch(opponent, switches, battle, force=True)
                if best:
                    logger.debug("Forced switch → %s", best.species)
                    return self.create_order(best)
            return None

        if active is None or opponent is None:
            return None

        moves    = list(battle.available_moves)
        switches = list(battle.available_switches)

        # Contexto de juego
        our_alive  = sum(1 for m in battle.team.values() if not m.fainted)
        opp_alive  = sum(1 for m in battle.opponent_team.values() if not m.fainted)
        is_endgame = our_alive <= 2 and opp_alive <= 2
        is_last    = len(switches) == 0

        # Calcular daño de todos nuestros movimientos
        damage_results = sorted(
            [estimate_damage_fraction(m, active, opponent, battle)
             for m in moves if m.base_power > 0],
            key=lambda r: r.fraction, reverse=True,
        )

        # También con Tera
        tera_results: list[DamageResult] = []
        if self._tera_available(battle):
            tera_results = sorted(
                [estimate_damage_fraction(m, active, opponent, battle, attacker_tera=True)
                 for m in moves if m.base_power > 0],
                key=lambda r: r.fraction, reverse=True,
            )

        opp_threat = self._estimate_opponent_threat(opponent, active, battle)
        outspeed   = _we_outspeed(active, opponent, battle)

        # Win condition: si el activo es nuestro win-con, evitar sacrificarlo
        win_con = self._identify_win_condition(battle)
        is_win_con = (win_con is not None and win_con.species == active.species)

        # ── 1. KO con Tera ────────────────────────────────────────────────────
        if tera_results and self._tera_available(battle):
            best_tera = tera_results[0]
            remaining = opponent.current_hp_fraction
            if best_tera.fraction >= remaining * TERA_OFFENSIVE_THRESHOLD and best_tera.tera_boost:
                best_normal = damage_results[0].fraction if damage_results else 0
                if best_tera.fraction > best_normal * 1.2 or (
                    best_tera.fraction >= remaining and best_normal < remaining
                ):
                    logger.debug("TERA KO con %s (%.0f%%)", best_tera.move.id, best_tera.fraction * 100)
                    self._tera_used[battle.battle_tag] = True
                    return self.create_order(best_tera.move, terastallize=True)

        # ── 2. KO sin Tera ────────────────────────────────────────────────────
        if damage_results:
            best = damage_results[0]
            remaining = opponent.current_hp_fraction
            if best.fraction >= remaining * CRIT_KO_THRESHOLD:
                logger.debug("KO con %s (%.0f%%)", best.move.id, best.fraction * 100)
                return self.create_order(best.move)

        # ── 3. Switch defensivo: rival nos amenaza y va primero ───────────────
        threatened = opp_threat >= active.current_hp_fraction * SWITCH_THREAT_THRESHOLD
        if threatened and not outspeed:
            # Tera defensivo-ofensivo: sobrevivimos Y hacemos KO
            if self._tera_available(battle) and tera_results:
                best_tera_d = tera_results[0]
                if best_tera_d.fraction >= opponent.current_hp_fraction * CRIT_KO_THRESHOLD:
                    logger.debug("TERA defensivo-ofensivo")
                    self._tera_used[battle.battle_tag] = True
                    return self.create_order(best_tera_d.move, terastallize=True)

            # No sacrificar el win-con si podemos hacer daño razonable
            if not (is_win_con and damage_results and damage_results[0].fraction > 0.3):
                best_switch = self._find_best_switch(opponent, switches, battle)
                if best_switch:
                    logger.debug("Switch defensivo → %s", best_switch.species)
                    return self.create_order(best_switch)

        # ── 3b. Inutilidad ofensiva: todos nuestros ataques hacen 0 daño ──────
        best_offensive = damage_results[0].fraction if damage_results else 0.0
        if best_offensive == 0.0 and switches:
            # Intentar Tera para salir de la inmunidad
            if self._tera_available(battle) and tera_results:
                best_tera_off = tera_results[0]
                if best_tera_off.fraction > 0.0:
                    logger.debug("TERA para salir de inmunidad con %s", best_tera_off.move.id)
                    self._tera_used[battle.battle_tag] = True
                    return self.create_order(best_tera_off.move, terastallize=True)
            best_switch = self._find_best_switch(opponent, switches, battle, force=True)
            if best_switch:
                logger.debug("Switch por inutilidad ofensiva → %s", best_switch.species)
                return self.create_order(best_switch)

        # ── 4. Choice lock → setup ────────────────────────────────────────────
        locked_move = self._opp_might_be_choice_locked(battle)
        if locked_move:
            locked_eff = 1.0
            if battle.opponent_active_pokemon and locked_move in battle.opponent_active_pokemon.moves:
                locked_eff = active.damage_multiplier(
                    battle.opponent_active_pokemon.moves[locked_move]
                )
            if locked_eff <= 0.5:
                for move in moves:
                    if move.id in SETUP_MOVES:
                        logger.debug("Setup gratis vs rival locked: %s", move.id)
                        return self.create_order(move)

        # ── 5. Counter al setup rival ─────────────────────────────────────────
        if self._opponent_has_setup(battle):
            counter = self._find_setup_counter(opponent, switches, moves, active, battle)
            if counter:
                return counter

        # ── 6. Priority kill: rival con poco HP ──────────────────────────────
        if opponent.current_hp_fraction <= 0.35 and (not outspeed or opp_threat >= 0.5):
            priority = self._try_priority_kill(moves, opponent, active, battle)
            if priority:
                return priority

        # ── 7. Pivot move si el matchup es desfavorable ───────────────────────
        if not is_last and switches:
            pivot = self._try_pivot_move(moves, active, opponent, battle,
                                         opp_threat, damage_results)
            if pivot:
                return pivot

        # ── 8. Status ofensivo ────────────────────────────────────────────────
        if self._should_use_status(active, opponent, battle, outspeed, opp_alive):
            status_move = self._pick_status_move(moves, opponent)
            if status_move:
                return self.create_order(status_move)

        # ── 9. Mejor movimiento con scoring completo ──────────────────────────
        best_move = self._score_and_pick_move(
            moves, active, opponent, battle,
            is_endgame=is_endgame, is_last=is_last,
            opp_alive=opp_alive, opp_threat=opp_threat,
        )
        if best_move:
            return self.create_order(best_move)

        return None

    # ── Estimación de amenaza rival ───────────────────────────────────────────

    def _estimate_opponent_threat(
        self, opponent: Pokemon, defender: Pokemon,
        battle: Optional[AbstractBattle] = None,
    ) -> float:
        best_threat = 0.0

        if battle:
            revealed = self._opp_revealed_moves(battle)
            for mid in revealed:
                move_obj = opponent.moves.get(mid)
                if move_obj and move_obj.base_power > 0:
                    result = estimate_damage_fraction(move_obj, opponent, defender, battle)
                    best_threat = max(best_threat, result.fraction)

        if best_threat == 0.0:
            chart = GEN_DATA.type_chart
            for opp_type in opponent.types:
                if opp_type is None:
                    continue
                mult = 1.0
                for def_type in defender.types:
                    if def_type is None:
                        continue
                    # chart[defending][attacking] → opp ataca defender: chart[def_type][opp_type]
                    if def_type.name in chart and opp_type.name in chart[def_type.name]:
                        mult *= chart[def_type.name][opp_type.name]

                raw_atk = max(
                    _get_stat(opponent, "atk", 120),
                    _get_stat(opponent, "spa", 120),
                )
                # Aplicar Huge Power si corresponde
                if opponent.ability in DOUBLE_ATTACK_ABILITIES:
                    raw_atk *= 2

                opp_atk = max(
                    _apply_boost(raw_atk, opponent.boosts.get("atk", 0) if opponent.boosts else 0),
                    _apply_boost(raw_atk, opponent.boosts.get("spa", 0) if opponent.boosts else 0),
                )
                our_def = min(
                    _apply_boost(_get_stat(defender, "def", 120),
                                 defender.boosts.get("def", 0) if defender.boosts else 0),
                    _apply_boost(_get_stat(defender, "spd", 120),
                                 defender.boosts.get("spd", 0) if defender.boosts else 0),
                )
                base_damage = ((2 * LEVEL / 5 + 2) * 90 * opp_atk / our_def) / 50 + 2
                threat_fraction = base_damage * 1.5 * mult / _get_stat(defender, "hp", 350)
                best_threat = max(best_threat, threat_fraction)

        return best_threat

    # ── Setup rival ───────────────────────────────────────────────────────────

    def _opponent_has_setup(self, battle: AbstractBattle) -> bool:
        opp = battle.opponent_active_pokemon
        if opp is None:
            return False
        boosts = opp.boosts or {}
        return (
            boosts.get("atk", 0) >= 2 or boosts.get("spa", 0) >= 2
            or boosts.get("spe", 0) >= 2
            or (boosts.get("atk", 0) >= 1 and boosts.get("spe", 0) >= 1)
            or (boosts.get("spa", 0) >= 1 and boosts.get("spe", 0) >= 1)
        )

    def _find_setup_counter(
        self, opponent: Pokemon, switches: list[Pokemon],
        moves: list[Move], active: Pokemon,
        battle: Optional[AbstractBattle] = None,
    ) -> Optional[BattleOrder]:
        # Phazing — no usar Dragon Tail contra Normal (no efecto)
        for move in moves:
            if move.id in PHAZING_MOVES:
                if move.id == "dragontail" and PokemonType.NORMAL in opponent.types:
                    continue
                logger.debug("Phazing al rival setupeado: %s", move.id)
                return self.create_order(move)
        # Prioridad con efectividad ≥1x
        for move in moves:
            if move.id in TRUE_PRIORITY and move.base_power > 0:
                if opponent.damage_multiplier(move) >= 1.0:
                    return self.create_order(move)
        # Super efectivo
        for move in moves:
            if move.base_power > 0 and opponent.damage_multiplier(move) >= 2.0:
                return self.create_order(move)
        # Switch
        best_switch = self._find_best_switch(opponent, switches, battle)
        if best_switch:
            return self.create_order(best_switch)
        return None

    # ── Priority kill ─────────────────────────────────────────────────────────

    def _try_priority_kill(
        self, moves: list[Move], opponent: Pokemon,
        active: Pokemon, battle: Optional[AbstractBattle] = None,
    ) -> Optional[BattleOrder]:
        for move in moves:
            if move.id not in TRUE_PRIORITY or move.base_power <= 0:
                continue
            result = estimate_damage_fraction(move, active, opponent, battle)
            if result.fraction >= opponent.current_hp_fraction * 0.9:
                logger.debug("Remate con prioridad: %s", move.id)
                return self.create_order(move)
        return None

    # ── Pivot moves ───────────────────────────────────────────────────────────

    def _try_pivot_move(
        self, moves: list[Move], active: Pokemon, opponent: Pokemon,
        battle: AbstractBattle, opp_threat: float,
        damage_results: list[DamageResult],
    ) -> Optional[BattleOrder]:
        """
        Usa U-turn / Volt Switch si el matchup es desfavorable:
        - El rival nos amenaza fuerte Y
        - Nuestro mejor ataque hace poco daño (<30% de su HP)
        """
        best_dmg = damage_results[0].fraction if damage_results else 0.0
        matchup_bad = opp_threat > 0.4 and best_dmg < 0.3

        if not matchup_bad:
            return None

        for move in moves:
            if move.id in PIVOT_MOVES and move.base_power > 0:
                logger.debug("Pivot move %s en matchup desfavorable", move.id)
                return self.create_order(move)
        return None

    # ── Status ofensivo ───────────────────────────────────────────────────────

    def _should_use_status(
        self, active: Pokemon, opponent: Pokemon,
        battle: AbstractBattle, outspeed: bool, opp_alive: int,
    ) -> bool:
        if opponent.status is not None:
            return False
        if opponent.current_hp_fraction < 0.5:
            return False
        if active.current_hp_fraction < 0.4:
            return False
        # En endgame con 1 rival vivo, no perder turno en status si podemos atacar
        if opp_alive == 1 and active.current_hp_fraction > 0.6:
            return True
        return True

    def _pick_status_move(
        self, moves: list[Move], opponent: Pokemon
    ) -> Optional[Move]:
        for move in moves:
            if move.id not in STATUS_MOVES:
                continue
            if move.id == "thunderwave":
                if PokemonType.ELECTRIC in opponent.types or PokemonType.GROUND in opponent.types:
                    continue
            elif move.id in ("willowisp",):
                if PokemonType.FIRE in opponent.types:
                    continue
                # Flash Fire también absorbe Will-O-Wisp
                if opponent.ability == "flashfire":
                    continue
            elif move.id in ("toxic", "toxicspikes"):
                if PokemonType.POISON in opponent.types or PokemonType.STEEL in opponent.types:
                    continue
            return move
        return None

    # ── Scoring de movimientos ────────────────────────────────────────────────

    def _score_and_pick_move(
        self, moves: list[Move], active: Pokemon, opponent: Pokemon,
        battle: AbstractBattle, is_endgame: bool = False,
        is_last: bool = False, opp_alive: int = 3, opp_threat: float = 0.0,
    ) -> Optional[Move]:
        best_move:  Optional[Move] = None
        best_score = -1.0

        for move in moves:
            score = 0.0

            if move.base_power > 0:
                result = estimate_damage_fraction(move, active, opponent, battle)
                score += result.fraction * 100

                if result.effectiveness == 0.0:
                    score -= 999   # inmune: nunca usar
                elif result.effectiveness >= 4.0:
                    score += 35
                elif result.effectiveness >= 2.0:
                    score += 20
                elif result.effectiveness <= 0.25:
                    score -= 30
                elif result.effectiveness <= 0.5:
                    score -= 10

                if result.stab:
                    score += 10

                if move.id in TRUE_PRIORITY:
                    if not _we_outspeed(active, opponent, battle) \
                            and opponent.current_hp_fraction < 0.5:
                        score += 20
                    else:
                        score += 5

                # Pivot: bonus si matchup es desfavorable
                if move.id in PIVOT_MOVES:
                    if opp_threat > 0.4 and result.fraction < 0.3:
                        score += 15

            else:
                # Hazards
                if move.id in HAZARD_MOVES:
                    if not self._hazards_set(move.id, battle):
                        hazard_value = 35 if opp_alive >= 3 else (15 if opp_alive >= 2 else -5)
                        score += hazard_value
                    else:
                        score -= 10

                # Recovery — ajustar por clima (Morning Sun bajo arena/lluvia cura menos)
                elif move.id in RECOVERY_MOVES:
                    hp = active.current_hp_fraction
                    base_score = 60 if hp < 0.35 else (35 if hp < 0.5 else -5)
                    # Reducir valor si la recovery es weather-dependent y el clima es malo
                    weather_heal_penalty = 0
                    if move.id in ("morningsun", "synthesis", "moonlight"):
                        w = next(iter(battle.weather), None) if battle.weather else None
                        if w in (Weather.SANDSTORM, Weather.RAINDANCE,
                                 Weather.PRIMORDIALSEA, Weather.SNOWSCAPE):
                            weather_heal_penalty = 15
                    # Urgencia extra si somos el último
                    if is_last:
                        base_score += 20
                    score += base_score - weather_heal_penalty

                # Setup — evaluar por amenaza real, no solo HP del rival
                elif move.id in SETUP_MOVES:
                    if opp_threat < 0.3:
                        # Rival no amenaza → seguro setupear
                        setup_bonus = 50 if is_endgame else 30
                        score += setup_bonus
                    elif opp_threat < 0.5:
                        score += 10
                    else:
                        score -= 20  # demasiado peligroso

                elif move.id in STATUS_MOVES:
                    if self._should_use_status(active, opponent, battle,
                                               _we_outspeed(active, opponent, battle),
                                               opp_alive):
                        score += 25
                    else:
                        score -= 15

                elif move.id in PHAZING_MOVES:
                    score += 50 if self._opponent_has_setup(battle) else -5

            if score > best_score:
                best_score = score
                best_move = move

        return best_move if best_score > 0 else None

    def _hazards_set(self, move_id: str, battle: AbstractBattle) -> bool:
        opp_conditions = battle.opponent_side_conditions
        if move_id == "stealthrock":
            return SideCondition.STEALTH_ROCK in opp_conditions
        if move_id == "spikes":
            return opp_conditions.get(SideCondition.SPIKES, 0) >= 3
        if move_id == "toxicspikes":
            return opp_conditions.get(SideCondition.TOXIC_SPIKES, 0) >= 2
        return False

    # ── Hazard entry damage ───────────────────────────────────────────────────

    def _hazard_entry_damage(self, mon: Pokemon, battle: AbstractBattle) -> float:
        """Estima el daño fraccionario por hazards al entrar al campo."""
        if mon.item == "heavydutyboots":
            return 0.0

        conditions = battle.side_conditions
        damage     = 0.0
        chart      = GEN_DATA.type_chart

        # Stealth Rock: 1/8 × efectividad de Rock vs tipos del mon
        # chart[defending][attacking] → Rock ataca mon_type: chart[mon_type][ROCK]
        if SideCondition.STEALTH_ROCK in conditions:
            rock_mult = 1.0
            rock_name = PokemonType.ROCK.name
            for mon_type in mon.types:
                if mon_type is None:
                    continue
                if mon_type.name in chart and rock_name in chart[mon_type.name]:
                    rock_mult *= chart[mon_type.name][rock_name]
            damage += 0.125 * rock_mult

        # Spikes: solo afectan a Pokémon en suelo (no Flying, no Levitate)
        spikes = conditions.get(SideCondition.SPIKES, 0)
        if spikes > 0:
            grounded = (
                PokemonType.FLYING not in mon.types
                and mon.ability != "levitate"
                and mon.item != "airballoon"
            )
            if grounded:
                spikes_damage = {1: 1 / 8, 2: 1 / 6, 3: 1 / 4}
                damage += spikes_damage.get(spikes, 0)

        # Toxic Spikes: Pokémon Poison/Steel son inmunes y limpian el campo
        toxic_spikes = conditions.get(SideCondition.TOXIC_SPIKES, 0)
        if toxic_spikes > 0:
            if (PokemonType.POISON in mon.types or PokemonType.STEEL in mon.types
                    or mon.ability == "levitate"
                    or PokemonType.FLYING in mon.types):
                pass  # inmune
            else:
                # Daño por turno aproximado (~1/8 primer turno de chip)
                damage += 0.06

        return damage

    # ── Switch inteligente ────────────────────────────────────────────────────

    def _max_incoming_damage(
        self, opponent: Pokemon, mon: Pokemon,
        battle: Optional[AbstractBattle],
    ) -> float:
        """
        Calcula el máximo daño (fracción del HP) que el oponente puede infligir
        al candidato `mon` considerando:
          - Moves REALES revelados (con estimate_damage_fraction completo)
          - Moves STAB no revelados: estimación conservadora por cada tipo del rival
            usando la fórmula real con 90 BP como baseline
        Usa mon.damage_multiplier() para la efectividad de tipo — maneja
        correctamente doble tipo, inmunidades parciales y habilidades registradas.
        """
        chart = GEN_DATA.type_chart
        max_dmg = 0.0

        # 1) Moves revelados — estimación completa
        if battle:
            revealed = self._opp_revealed_moves(battle)
            for mid in revealed:
                move_obj = opponent.moves.get(mid)
                if move_obj and move_obj.base_power > 0:
                    result = estimate_damage_fraction(move_obj, opponent, mon, battle)
                    max_dmg = max(max_dmg, result.fraction)

        # 2) STAB no revelados — estimar con 90 BP y stats reales del rival
        revealed_types: set = set()
        if battle:
            for mid in self._opp_revealed_moves(battle):
                move_obj = opponent.moves.get(mid)
                if move_obj and move_obj.base_power > 0:
                    revealed_types.add(move_obj.type)

        for opp_type in opponent.types:
            if opp_type is None or opp_type in revealed_types:
                continue

            # Efectividad del tipo contra mon (dual-type combinado, inmunidades)
            # chart[defending][attacking] → opp_type ataca mon: chart[mon_type][opp_type]
            eff = 1.0
            for mon_type in mon.types:
                if mon_type is None:
                    continue
                if mon_type.name in chart and opp_type.name in chart[mon_type.name]:
                    eff *= chart[mon_type.name][opp_type.name]
            if eff == 0.0:
                continue  # mon es inmune a este tipo STAB

            # Ability immunity check simplificado
            immune_types = ABILITY_IMMUNITIES.get(mon.ability or "", set())
            if opp_type in immune_types:
                continue

            raw_atk = max(
                _get_stat(opponent, "atk", 120),
                _get_stat(opponent, "spa", 120),
            )
            if opponent.ability in DOUBLE_ATTACK_ABILITIES:
                raw_atk *= 2
            mon_def = min(
                _get_stat(mon, "def", 110),
                _get_stat(mon, "spd", 110),
            )
            mon_hp = _get_stat(mon, "hp", 350)

            # Fórmula Gen 9 con 90 BP + STAB
            base = ((2 * LEVEL / 5 + 2) * 90 * raw_atk / (mon_def or 1)) / 50 + 2
            est_dmg = base * 1.5 * eff / (mon_hp or 1)
            max_dmg = max(max_dmg, est_dmg)

        return max_dmg

    def _find_best_switch(
        self, opponent: Pokemon, switches: list[Pokemon],
        battle: Optional[AbstractBattle], force: bool = False,
    ) -> Optional[Pokemon]:
        """
        Encuentra el mejor switch-in usando daño real en ambas direcciones.

        Modelo corregido:
        - def_score: basado en el MÁXIMO daño que el rival puede infligirnos
          (moves revelados + STAB no revelados). Evalúa cada tipo del rival
          INDEPENDIENTEMENTE — una inmunidad a Fighting NO oculta la debilidad
          a Ground (bug del acumulador roto anterior).
        - off_score: mejor multiplicador de tipo vs rival activo.
        - Penalización por ser débil al equipo rival restante.
        - Bonus Intimidate.
        - Descuento por hazard entry damage.
        """
        best: Optional[Pokemon] = None
        best_score = -9999.0

        chart = GEN_DATA.type_chart
        all_opp_revealed = list(battle.opponent_team.values()) if battle else [opponent]

        for mon in switches:
            if mon.fainted:
                continue

            # HP efectivo descontando entrada a hazards
            hazard_dmg = self._hazard_entry_damage(mon, battle) if battle else 0.0
            effective_hp = mon.current_hp_fraction - hazard_dmg
            if effective_hp < 0.12:
                continue  # entraría demasiado débil

            # ── Def score: qué tan seguro es entrar vs el rival activo ────────
            # Calcula el máximo daño que el rival puede hacernos (fracción HP)
            max_incoming = self._max_incoming_damage(opponent, mon, battle)

            # Si nos mata de entrada, ni considerarlo (salvo force y no hay mejor)
            if max_incoming >= effective_hp and not force:
                continue

            # def_score: 1.0 = rival no puede hacernos nada, 0.0 = OHKO
            # Escala lineal inversa; capada a 0 para no dar negativos aquí
            def_score = max(0.0, 1.0 - max_incoming)

            # Bonus Intimidate: reduce amenaza física ~1 stage
            if mon.ability == "intimidate":
                def_score = min(1.5, def_score * 1.3)

            # ── Off score: qué tan bien golpeamos al rival ───────────────────
            # chart[defending][attacking] → mon_type ataca opp: chart[opp_type][mon_type]
            off_score = 0.0
            for mon_type in mon.types:
                if mon_type is None:
                    continue
                mult = 1.0
                for opp_type in opponent.types:
                    if opp_type is None:
                        continue
                    if opp_type.name in chart and mon_type.name in chart[opp_type.name]:
                        mult *= chart[opp_type.name][mon_type.name]
                off_score = max(off_score, mult)

            # ── Penalización por debilidades vs equipo rival restante ─────────
            # chart[defending][attacking] → opp_type ataca mon: chart[mon_type][opp_type]
            team_vuln_penalty = 0.0
            for opp_mon in all_opp_revealed:
                if opp_mon.fainted or opp_mon == opponent:
                    continue
                for opp_type in opp_mon.types:
                    if opp_type is None:
                        continue
                    for mon_type in mon.types:
                        if mon_type is None:
                            continue
                        if mon_type.name in chart and opp_type.name in chart[mon_type.name]:
                            m = chart[mon_type.name][opp_type.name]
                            if m >= 2.0:
                                team_vuln_penalty += 0.2

            # ── Score total ───────────────────────────────────────────────────
            # Ponderación: defensa importa más que ataque al hacer switch
            score = (def_score * 2.5) + (off_score * 0.5) + (effective_hp * 0.8) \
                    - team_vuln_penalty

            logger.debug(
                "Switch eval %s | max_in=%.0f%% def=%.2f off=%.2f hp=%.0f%% → score=%.2f",
                mon.species, max_incoming * 100, def_score, off_score,
                effective_hp * 100, score,
            )

            # Threshold más permisivo en force para evitar quedarse sin opción
            threshold = -2.0 if force else 0.5
            if score > best_score and score > threshold:
                best_score = score
                best = mon

        return best

    # ── Feedback ──────────────────────────────────────────────────────────────

    def _get_tracker(self, battle: AbstractBattle) -> BattleFeedback:
        tag = battle.battle_tag
        if tag not in self._feedback_trackers:
            self._feedback_trackers[tag] = BattleFeedback()
        return self._feedback_trackers[tag]

    def _battle_finished_callback(self, battle: AbstractBattle) -> None:
        tracker = self._feedback_trackers.pop(battle.battle_tag, None)
        self._revealed_moves.pop(battle.battle_tag, None)
        self._prev_opp_moves.pop(battle.battle_tag, None)
        self._last_opp_move.pop(battle.battle_tag, None)
        self._tera_used.pop(battle.battle_tag, None)

        if tracker is None:
            return
        feedback_msg = tracker.generate(battle)
        print(f"\n{'='*52}")
        print(feedback_msg)
        print('='*52 + "\n")
