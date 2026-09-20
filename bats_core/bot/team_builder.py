"""
bats_core/bot/team_builder.py
========================
Construye equipos válidos para el formato [Gen 9] PinchesGueys League — Torneo #02.

Reglas que aplica:
  R4:  Máx 1 Paradox (los sets del pool ya lo respetan — solo 1 restricted puede ser Paradox)
  R5:  Sin Baton Pass (los sets del pool ya lo cumplen)
  R6:  Máx 1 Paradox Pokémon
  R7:  Máx 1 Pseudo-Legendario
  R9:  Item-Bound baneados (cubierto en banlist del formato)
  R10: Sin ítems duplicados — Item Clause (rastreado aquí con used_items)
  R11: Ultra Beasts prohibidos (cubierto en onValidateTeam)
  C1:  Al menos 1 tipo Hielo
  C2:  Al menos 1 Pokémon Gen 5 (#494–649)
  C3:  Al menos 1 Pokémon Egg Group Dragón
  C4:  Al menos 1 Pokémon color Amarillo
"""

from __future__ import annotations

import json
import logging
import random
import re
from pathlib import Path

from .config import BANS_FILE, TYPE_OF_MONTH, TEAM_SIZE
from .validator import validate_paste
from .sets import (
    RESTRICTED_POOL,
    PSEUDO_POOL,
    ICE_OU_POOL,
    GEN5_POOL,
    DRAGON_EGG_POOL,
    YELLOW_POOL,
    OU_POOL,
    PokemonSet,
)

logger = logging.getLogger(__name__)

# Pool combinado de backup (sin legendarios/pseudos) para fallback cross-pool
ALL_CONDITION_POOLS: list[PokemonSet] = (
    ICE_OU_POOL + GEN5_POOL + DRAGON_EGG_POOL + YELLOW_POOL + OU_POOL
)

# Nombres normalizados de Pseudo-Legendarios (BST=600, sin tags de legendario).
# Usados para hacer cumplir la regla R7: máx. 1 Pseudo-Legendario por equipo.
# Incluye los de PSEUDO_POOL + los que aparecen en otros pools (DRAGON_EGG).
PSEUDO_NAMES: frozenset[str] = frozenset({
    # PSEUDO_POOL
    "garchomp", "dragapult", "tyranitar", "hydreigon", "salamence", "baxcalibur", "haxorus",
    # DRAGON_EGG_POOL — BST 600, sin tags legendarios
    "dragonite", "goodrahisui", "kommoo", "archaludon",
})

# Nombres normalizados de todos los Pokémon Paradoja (Gen 9, pasado/futuro)
# Usados para hacer cumplir la regla R4/R6: máx. 1 Paradox por equipo.
PARADOX_NAMES: frozenset[str] = frozenset({
    # Pasado (Ancient)
    "greattusk", "screamtail", "brutebonnet", "fluttermane",
    "slitherwing", "sandyshocks", "roaringmoon", "walkingwake",
    "gougingfire", "ragingbolt",
    # Futuro (Iron)
    "irontreads", "ironbundle", "ironhands", "ironjugulis",
    "ironmoth", "ironthorns", "ironvaliant", "ironleaves",
    "ironboulder", "ironcrown",
})


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _normalize(name: str) -> str:
    """Convierte nombre a ID estilo PS: minúsculas, sin espacios/guiones."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _is_pseudo(mon: PokemonSet) -> bool:
    """True si el Pokémon es Pseudo-Legendario (BST=600, sin tags legendarios)."""
    return _normalize(mon["name"]) in PSEUDO_NAMES


def _filter_pseudo(pool: list[PokemonSet], has_pseudo: bool) -> list[PokemonSet]:
    """Si ya hay un Pseudo en el equipo, excluye todos los Pseudos del pool."""
    if not has_pseudo:
        return pool
    return [m for m in pool if not _is_pseudo(m)]


def _is_paradox(mon: PokemonSet) -> bool:
    """True si el Pokémon es de tipo Paradoja (Pasado o Futuro)."""
    return _normalize(mon["name"]) in PARADOX_NAMES


def _filter_paradox(pool: list[PokemonSet], has_paradox: bool) -> list[PokemonSet]:
    """Si ya hay un Paradox en el equipo, excluye todos los Paradox del pool."""
    if not has_paradox:
        return pool
    return [m for m in pool if not _is_paradox(m)]


def _load_bans() -> set[str]:
    """Lee active_bans.json y retorna un set de IDs normalizados."""
    if not BANS_FILE.exists():
        logger.debug("active_bans.json no encontrado, sin bans activos.")
        return set()
    try:
        names: list[str] = json.loads(BANS_FILE.read_text(encoding="utf-8"))
        normalized = {_normalize(n) for n in names}
        logger.debug("Bans activos: %s", normalized)
        return normalized
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("No se pudo leer active_bans.json: %s", exc)
        return set()


def _is_banned(mon: PokemonSet, banned: set[str]) -> bool:
    return _normalize(mon["name"]) in banned


def _has_type(mon: PokemonSet, poke_type: str) -> bool:
    return poke_type in mon["types"]


def _meets_c2(mon: PokemonSet) -> bool:
    """C2: Gen 5 (dex #494–649)."""
    return mon["gen"] == 5


def _meets_c3(mon: PokemonSet) -> bool:
    """C3: Egg Group Dragón."""
    return "Dragon" in mon["egg_groups"]


def _meets_c4(mon: PokemonSet) -> bool:
    """C4: Color Amarillo."""
    return mon["color"] == "Yellow"


def _pick(
    pool: list[PokemonSet],
    banned: set[str],
    exclude_names: set[str] | None = None,
    used_items: set[str] | None = None,
) -> PokemonSet:
    """
    Elige un Pokémon aleatorio del pool que:
      - No esté baneado
      - No esté ya en el equipo (exclude_names)
      - No duplique ítem (used_items — Item Clause)
    Lanza ValueError si no hay opciones disponibles.
    """
    exclude_names = exclude_names or set()
    used_items = used_items or set()

    available = [
        m for m in pool
        if not _is_banned(m, banned)
        and _normalize(m["name"]) not in exclude_names
        and m["item"] not in used_items
    ]
    if not available:
        raise ValueError(
            f"No hay Pokémon disponibles en el pool (todos baneados, ya elegidos o item duplicado). "
            f"Pool: {[m['name'] for m in pool]}"
        )
    return random.choice(available)


def _add(
    mon: PokemonSet,
    team: list[PokemonSet],
    chosen_names: set[str],
    used_items: set[str],
) -> None:
    """Añade un Pokémon al equipo actualizando los sets de control."""
    team.append(mon)
    chosen_names.add(_normalize(mon["name"]))
    used_items.add(mon["item"])


def _pick_for_condition(
    primary_pool: list[PokemonSet],
    condition_fn,
    banned: set[str],
    chosen_names: set[str],
    used_items: set[str],
) -> PokemonSet:
    """
    Intenta cubrir una condición usando el pool primario.
    Si el pool primario está agotado (bans / item-clause), hace fallback
    a TODOS los pools de condición filtrando por condition_fn.

    Raises ValueError si no hay ningún Pokémon disponible en ningún pool.
    """
    # 1. Intentar el pool específico de la condición
    try:
        return _pick(primary_pool, banned, chosen_names, used_items)
    except ValueError:
        pass

    # 2. Fallback cross-pool: buscar en todos los pools cualquier Pokémon que cumpla
    fallback = [m for m in ALL_CONDITION_POOLS if condition_fn(m)]
    logger.warning(
        "Pool primario agotado — intentando fallback cross-pool (%d candidatos).",
        len(fallback),
    )
    return _pick(fallback, banned, chosen_names, used_items)


# ─── Builder principal ────────────────────────────────────────────────────────

def build_team_paste() -> str:
    """
    Construye un equipo PGL válido y lo retorna en formato Showdown paste.

    Algoritmo:
      1. Cargar bans actuales.
      2. Elegir 1 legendario restringido (slot fijo).
      3. Elegir 1 pseudo-legendario (slot fijo).
      4. Para cada condición no cubierta (C1 Ice, C2 Gen5, C3 DragonEgg, C4 Yellow),
         añadir 1 Pokémon del pool de backup correspondiente.
      5. Completar hasta 6 con OU (sin duplicar nombres ni ítems).
    """
    banned = _load_bans()
    chosen_names: set[str] = set()
    used_items: set[str] = set()
    team: list[PokemonSet] = []
    has_paradox: bool = False  # R4/R6: máx. 1 Paradox por equipo
    has_pseudo: bool = False   # R7:    máx. 1 Pseudo-Legendario por equipo

    # ── 1. Legendario restringido ─────────────────────────────────────────────
    try:
        legendary = _pick(
            _filter_paradox(RESTRICTED_POOL, has_paradox),
            banned, chosen_names, used_items,
        )
    except ValueError as exc:
        raise RuntimeError(f"No se pudo elegir legendario: {exc}") from exc

    _add(legendary, team, chosen_names, used_items)
    has_paradox = has_paradox or _is_paradox(legendary)
    logger.info("Legendario elegido: %s (item: %s)", legendary["name"], legendary["item"])

    # ── 2. Pseudo-legendario ──────────────────────────────────────────────────
    try:
        pseudo = _pick(
            _filter_paradox(PSEUDO_POOL, has_paradox),
            banned, chosen_names, used_items,
        )
    except ValueError as exc:
        raise RuntimeError(f"No se pudo elegir pseudo-legendario: {exc}") from exc

    _add(pseudo, team, chosen_names, used_items)
    has_paradox = has_paradox or _is_paradox(pseudo)
    has_pseudo = True  # El slot de pseudo siempre es un pseudo-legendario
    logger.info("Pseudo-legendario elegido: %s (item: %s)", pseudo["name"], pseudo["item"])

    # ── 3. Verificar condiciones cubiertas ────────────────────────────────────
    def conditions() -> tuple[bool, bool, bool, bool]:
        c1 = any(_has_type(m, TYPE_OF_MONTH) for m in team)
        c2 = any(_meets_c2(m) for m in team)
        c3 = any(_meets_c3(m) for m in team)
        c4 = any(_meets_c4(m) for m in team)
        return c1, c2, c3, c4

    has_c1, has_c2, has_c3, has_c4 = conditions()

    # ── 4. Cubrir condiciones faltantes (en orden de prioridad) ───────────────

    def _filtered(pool: list[PokemonSet]) -> list[PokemonSet]:
        """Aplica filtros de Paradox y Pseudo al pool antes de cualquier pick."""
        return _filter_pseudo(_filter_paradox(pool, has_paradox), has_pseudo)

    if not has_c1:
        try:
            ice_mon = _pick_for_condition(
                _filtered(ICE_OU_POOL),
                lambda m: _has_type(m, TYPE_OF_MONTH),
                banned, chosen_names, used_items,
            )
        except ValueError as exc:
            raise RuntimeError(f"No se pudo cubrir C1 (tipo {TYPE_OF_MONTH}): {exc}") from exc
        _add(ice_mon, team, chosen_names, used_items)
        has_paradox = has_paradox or _is_paradox(ice_mon)
        has_pseudo  = has_pseudo  or _is_pseudo(ice_mon)
        logger.info("C1 cubierto con: %s", ice_mon["name"])
        has_c1, has_c2, has_c3, has_c4 = conditions()

    if not has_c2:
        try:
            gen5_mon = _pick_for_condition(
                _filtered(GEN5_POOL),
                _meets_c2,
                banned, chosen_names, used_items,
            )
        except ValueError as exc:
            raise RuntimeError(f"No se pudo cubrir C2 (Gen 5): {exc}") from exc
        _add(gen5_mon, team, chosen_names, used_items)
        has_paradox = has_paradox or _is_paradox(gen5_mon)
        has_pseudo  = has_pseudo  or _is_pseudo(gen5_mon)
        logger.info("C2 cubierto con: %s", gen5_mon["name"])
        has_c1, has_c2, has_c3, has_c4 = conditions()

    if not has_c3:
        try:
            dragon_mon = _pick_for_condition(
                _filtered(DRAGON_EGG_POOL),
                _meets_c3,
                banned, chosen_names, used_items,
            )
        except ValueError as exc:
            raise RuntimeError(f"No se pudo cubrir C3 (Egg Group Dragón): {exc}") from exc
        _add(dragon_mon, team, chosen_names, used_items)
        has_paradox = has_paradox or _is_paradox(dragon_mon)
        has_pseudo  = has_pseudo  or _is_pseudo(dragon_mon)
        logger.info("C3 cubierto con: %s", dragon_mon["name"])
        has_c1, has_c2, has_c3, has_c4 = conditions()

    if not has_c4:
        try:
            yellow_mon = _pick_for_condition(
                _filtered(YELLOW_POOL),
                _meets_c4,
                banned, chosen_names, used_items,
            )
        except ValueError as exc:
            raise RuntimeError(f"No se pudo cubrir C4 (color Amarillo): {exc}") from exc
        _add(yellow_mon, team, chosen_names, used_items)
        has_paradox = has_paradox or _is_paradox(yellow_mon)
        has_pseudo  = has_pseudo  or _is_pseudo(yellow_mon)
        logger.info("C4 cubierto con: %s", yellow_mon["name"])

    # ── 5. Completar con OU ───────────────────────────────────────────────────
    # Se elige un slot a la vez para actualizar has_paradox tras cada pick y
    # evitar que random.sample tome 2 Paradox simultáneamente (R4/R6).
    remaining_slots = TEAM_SIZE - len(team)

    for slot in range(remaining_slots):
        def _ou_candidates() -> list[PokemonSet]:
            cands = [
                m for m in _filtered(OU_POOL)
                if not _is_banned(m, banned)
                and _normalize(m["name"]) not in chosen_names
                and m["item"] not in used_items
            ]
            if not cands:
                # Fallback: condition pools
                ou_names = {_normalize(m["name"]) for m in cands}
                cands = [
                    m for m in _filtered(ALL_CONDITION_POOLS)
                    if not _is_banned(m, banned)
                    and _normalize(m["name"]) not in chosen_names
                    and m["item"] not in used_items
                    and _normalize(m["name"]) not in ou_names
                ]
                logger.warning(
                    "OU pool insuficiente (slot %d/%d) — usando condition pools (%d candidatos).",
                    slot + 1, remaining_slots, len(cands),
                )
            return cands

        candidates = _ou_candidates()
        if not candidates:
            raise RuntimeError(
                f"No hay Pokémon disponibles para el slot OU {slot + 1}/{remaining_slots}. "
                f"Revisa que los pools no estén completamente baneados."
            )
        ou_mon = random.choice(candidates)
        _add(ou_mon, team, chosen_names, used_items)
        has_paradox = has_paradox or _is_paradox(ou_mon)
        has_pseudo  = has_pseudo  or _is_pseudo(ou_mon)
        logger.info("OU elegido: %s (item: %s)", ou_mon["name"], ou_mon["item"])

    # ── 6. Verificación final ─────────────────────────────────────────────────
    has_c1, has_c2, has_c3, has_c4 = conditions()
    if not all([has_c1, has_c2, has_c3, has_c4]):
        missing = [
            f"C1({TYPE_OF_MONTH})" if not has_c1 else None,
            "C2(Gen5)" if not has_c2 else None,
            "C3(DragonEgg)" if not has_c3 else None,
            "C4(Yellow)" if not has_c4 else None,
        ]
        raise RuntimeError(
            f"Equipo incompleto — condiciones no cubiertas: "
            f"{', '.join(c for c in missing if c)}"
        )

    # ── 7. Generar paste ──────────────────────────────────────────────────────
    paste = "\n\n".join(mon["paste"] for mon in team)

    logger.info(
        "Equipo construido (%d slots): %s",
        len(team),
        " / ".join(mon["name"] for mon in team),
    )

    # ── 8. Validar contra PS (fuente de verdad) ───────────────────────────────
    ps_errors = validate_paste(paste)
    if ps_errors:
        raise RuntimeError(
            "Equipo rechazado por el validador PS:\n"
            + "\n".join(f"  - {e}" for e in ps_errors)
        )

    return paste


def build_team_pool(n: int = 4) -> list[str]:
    """
    Genera un pool de n equipos distintos para usar con RandomTeamFromPool.

    poke-env rotará entre estos equipos batalla a batalla, dándole variedad
    al bot y haciendo la práctica más útil para el usuario.
    """
    teams: list[str] = []
    for i in range(n):
        try:
            paste = build_team_paste()
            teams.append(paste)
            logger.info("Equipo %d/%d generado.", i + 1, n)
        except RuntimeError as exc:
            logger.warning("No se pudo generar equipo %d: %s", i + 1, exc)

    if not teams:
        raise RuntimeError(
            "No se pudo generar ningún equipo válido. "
            "Revisa que el pool de Pokémon no esté completamente baneado."
        )

    return teams
