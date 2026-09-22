"""
bats_core/rules.py
==================
Motor de reglas de la liga: UNA definición de las restricciones de temporada.

Las reglas viven en tournament.seasons (columna `type_of_month` + JSONB
`restrictions`). Antes había cuatro copias sincronizadas a mano: este spec, el
`onValidateTeam` de pokemon-showdown/config/formats.ts, TYPE_OF_MONTH del bot y la
validación de teams.py. Ahora:

  * la API valida el registro con `check_team()`;
  * `GET /api/rules/active` publica `active_rules_payload()`;
  * el plugin bats-ingest de PS lo guarda en active_rules.json y formats.ts lo lee;
  * el PGL-Bot lee el tipo del mes de ese mismo archivo.

Para añadir una restricción basta con extender RESTRICTION_SPEC (no hay migración) y,
si hay que verificarla al registrar equipos, añadir su comprobación en check_team().
Las que necesitan datos que solo tiene el dex de PS (tags, BST) las aplica formats.ts.

Sin dependencias de FastAPI: la usan la API, el CLI y los tests.
"""
import json
from typing import Any, Optional

# ── Spec ──────────────────────────────────────────────────────────────────────
#   "enum" – valor de un conjunto fijo; nullable=True permite NULL (sin restricción)
#   "int"  – entero con rango; nullable=True permite NULL (sin restricción)
#   "bool" – booleano, default False (ausente = False)
# `default` se aplica cuando la clave no existe en la temporada.

RESTRICTION_SPEC: dict[str, dict[str, Any]] = {
    "required_color": {
        "type":     "enum",
        "values":   ["black", "blue", "brown", "gray", "green",
                     "pink", "purple", "red", "white", "yellow"],
        "nullable": True,
        "label":    "Color requerido",
        "hint":     "Al menos un pokémon del equipo debe ser de este color.",
    },
    "required_generation": {
        "type":     "int",
        "min":      1,
        "max":      9,
        "nullable": True,
        "label":    "Generación requerida",
        "hint":     "Al menos un pokémon del equipo debe ser de esta generación.",
    },
    "required_egg_group": {
        "type":     "enum",
        "values":   ["monster", "water1", "water2", "water3", "bug", "flying",
                     "field", "fairy", "grass", "human-like", "mineral",
                     "amorphous", "ditto", "dragon", "undiscovered"],
        "nullable": True,
        "label":    "Egg Group requerido",
        "hint":     "Al menos un pokémon del equipo debe pertenecer a este egg group.",
    },
    "item_clause": {
        "type":    "bool",
        "default": False,
        "label":   "Item Clause",
        "hint":    "No se puede repetir el mismo objeto entre los pokémon del equipo.",
    },
    "registration_closed": {
        "type":    "bool",
        "default": False,
        "label":   "Registro cerrado",
        "hint":    "Nadie puede registrar ni editar equipos, y los equipos pasan a ser públicos.",
    },
    "roster_enforcement": {
        "type":    "bool",
        "default": False,
        "label":   "Exigir el equipo registrado",
        "hint":    "Showdown rechaza en batalla cualquier set que no esté registrado en BATS. "
                   "Actívala solo cuando todos los equipos registrados estén validados.",
    },
    # Los tres límites siguientes los aplican la API (con los metadatos de tournament.dex_species)
    # y el formato de Showdown (config/formats.ts).
    "max_paradox": {
        "type":    "int",
        "min":     0,
        "max":     6,
        "default": 1,
        "label":   "Máximo de Paradox",
        "hint":    "Cuántos pokémon Paradox admite un equipo (6 = sin límite).",
    },
    "max_pseudo_legendary": {
        "type":    "int",
        "min":     0,
        "max":     6,
        "default": 1,
        "label":   "Máximo de pseudo-legendarios",
        "hint":    "Cuántos pseudo-legendarios (BST 600 sin tag legendario) admite un equipo (6 = sin límite).",
    },
    "max_restricted": {
        "type":    "int",
        "min":     0,
        "max":     6,
        "default": 1,
        "label":   "Máximo de legendarios restringidos",
        "hint":    "Cuántos Sub-Legendary / Restricted Legendary / Mythical admite un equipo (6 = sin límite).",
    },
}


class RuleError(ValueError):
    """Valor de restricción inválido."""


def validate_restriction(key: str, value: Any) -> Any:
    """Valida y normaliza el valor de una restricción. Lanza RuleError si es inválido."""
    if key not in RESTRICTION_SPEC:
        raise RuleError(f"Restricción desconocida: '{key}'")
    spec = RESTRICTION_SPEC[key]

    if value is None:
        if spec.get("nullable"):
            return None
        raise RuleError(f"'{key}' no puede ser nulo.")

    if spec["type"] == "enum":
        if value not in spec["values"]:
            raise RuleError(f"'{key}': valor inválido '{value}'. Opciones: {spec['values']}")
        return value

    if spec["type"] == "int":
        if isinstance(value, bool) or not isinstance(value, int):
            raise RuleError(f"'{key}' debe ser un entero.")
        if not (spec["min"] <= value <= spec["max"]):
            raise RuleError(f"'{key}' debe estar entre {spec['min']} y {spec['max']}.")
        return value

    if spec["type"] == "bool":
        if not isinstance(value, bool):
            raise RuleError(f"'{key}' debe ser un booleano.")
        return value

    return value  # tipo desconocido: pasa tal cual


def normalize_restrictions(raw: Optional[dict | str]) -> dict:
    """Restricciones con defaults aplicados y sin claves desconocidas."""
    if isinstance(raw, str):
        raw = json.loads(raw)
    raw = raw or {}
    result: dict[str, Any] = {}
    for key, spec in RESTRICTION_SPEC.items():
        val = raw.get(key)
        if val is not None:
            result[key] = val
        elif spec.get("nullable"):
            result[key] = None
        else:
            result[key] = spec.get("default", False)
    return result


def active_rules_payload(season: dict, bans: list[str]) -> dict:
    """Lo que consumen el plugin de PS (active_rules.json) y el bot."""
    return {
        "season_id":     season["season_id"],
        "season_name":   season["season_name"],
        "type_of_month": season["type_of_month"],
        "restrictions":  normalize_restrictions(season.get("restrictions")),
        "bans":          sorted(bans),
    }


# ── Validación de un equipo ───────────────────────────────────────────────────

def check_team(
    entries: list[dict],
    restrictions: Optional[dict | str],
    type_of_month: Optional[str] = None,
    lineup: bool = False,
) -> list[dict]:
    """
    Comprueba un equipo contra las restricciones y devuelve TODAS las violaciones
    (lista vacía = válido). Cada una: {"rule", "code", "names"}.

    `code` conserva el formato que ya entiende el frontend
    ("item_clause:Leftovers", "missing_color:yellow", ...).

    `entries`: dicts con held_item, color, generation, egg_groups y types ("Ice / Flying"),
    más las banderas del dex (is_paradox, is_pseudo, is_restricted, is_ultra_beast,
    league_legal). Las banderas ausentes no generan violación: así se puede comprobar un
    equipo sin dex (tests, CLI). En la API las rellena dex.resolve_entries().

    `lineup`: True cuando `entries` son los (hasta 6) pokémon que se llevan a batalla. Los
    límites de Paradox / pseudo-legendarios / restringidos (DEX_LIMITS) solo se cuentan ahí,
    igual que en config/formats.ts; el pool registrado (hasta 8) no los cuenta.

    `type_of_month` es opcional: /api/teams/me solo lo pasa cuando quiere mostrarlo
    como comprobación informativa; el registro NO lo exige (lo hace el formato de
    Showdown al validar el equipo para batalla).
    """
    rules = normalize_restrictions(restrictions)
    violations: list[dict] = []

    if rules["item_clause"]:
        seen: dict[str, int] = {}
        for e in entries:
            if e.get("held_item"):
                seen[e["held_item"]] = seen.get(e["held_item"], 0) + 1
        dupes = [item for item, n in seen.items() if n > 1]
        if dupes:
            violations.append({"rule": "item_clause", "code": f"item_clause:{','.join(dupes)}", "names": dupes})

    color = rules["required_color"]
    if color and not any(e.get("color") and e["color"].lower() == color for e in entries):
        violations.append({"rule": "required_color", "code": f"missing_color:{color}", "names": []})

    gen = rules["required_generation"]
    if gen and not any(e.get("generation") == gen for e in entries if e.get("generation")):
        violations.append({"rule": "required_generation", "code": f"missing_generation:{gen}", "names": []})

    egg = rules["required_egg_group"]
    if egg and not any(egg in (e.get("egg_groups") or []) for e in entries):
        violations.append({"rule": "required_egg_group", "code": f"missing_egg_group:{egg}", "names": []})

    if type_of_month and not any(
        type_of_month.lower() in [t.strip().lower() for t in (e.get("types") or "").split("/")]
        for e in entries
    ):
        violations.append({"rule": "type_of_month", "code": f"missing_type:{type_of_month}", "names": []})

    # Reglas del dex (antes solo las aplicaba config/formats.ts).
    illegal = [e["name"] for e in entries if e.get("league_legal") is False]
    if illegal:
        violations.append({"rule": "not_legal", "code": f"not_legal:{','.join(illegal)}", "names": illegal})

    ubs = [e["name"] for e in entries if e.get("is_ultra_beast")]
    if ubs:
        violations.append({"rule": "ultra_beast", "code": f"ultra_beast:{','.join(ubs)}", "names": ubs})

    for key, flag in (DEX_LIMITS if lineup else ()):
        hits = _flagged(entries, flag)
        if len(hits) > rules[key]:
            violations.append({"rule": key, "code": f"{key}:{len(hits)}/{rules[key]}", "names": hits})

    return violations


# Límite de equipo → bandera del dex que se cuenta.
DEX_LIMITS = (("max_paradox", "is_paradox"),
              ("max_pseudo_legendary", "is_pseudo"),
              ("max_restricted", "is_restricted"))


def _flagged(entries: list[dict], flag: str) -> list[str]:
    return [e["name"] for e in entries if e.get(flag)]


# ── Checklist para el teambuilder ─────────────────────────────────────────────

def rule_checklist(
    entries: list[dict],
    restrictions: Optional[dict | str],
    type_of_month: Optional[str] = None,
    max_team_size: Optional[int] = None,
    banned_names: Optional[set[str]] = None,
    lineup: bool = False,
) -> list[dict]:
    """
    Una fila por cada regla aplicable, cumpla o no: {"rule", "label", "ok", "names"}.
    Es lo que pinta el teambuilder en vivo. Los límites de Paradox, pseudo-legendarios y restringidos
    solo aparecen con lineup=True (ver check_team).
    """
    rules = normalize_restrictions(restrictions)
    failed = {v["rule"]: v for v in check_team(entries, rules, type_of_month, lineup)}
    rows: list[dict] = []

    def add(rule: str, label: str, names: Optional[list[str]] = None) -> None:
        rows.append({"rule": rule, "label": label, "ok": rule not in failed, "names": names or []})

    if max_team_size is not None:
        ok = len(entries) <= max_team_size
        rows.append({"rule": "team_size", "label": f"Máximo {max_team_size} pokémon ({len(entries)}/{max_team_size})",
                     "ok": ok, "names": []})
    if banned_names is not None:
        hits = [e["name"] for e in entries if e.get("name", "").lower() in banned_names]
        rows.append({"rule": "banned", "label": "Sin pokémon baneados", "ok": not hits, "names": hits})
    if type_of_month:
        add("type_of_month", f"Al menos 1 pokémon de tipo {type_of_month}")
    if rules["required_generation"]:
        add("required_generation", f"Al menos 1 pokémon de la generación {rules['required_generation']}")
    if rules["required_egg_group"]:
        add("required_egg_group", f"Al menos 1 pokémon del Egg Group {rules['required_egg_group']}")
    if rules["required_color"]:
        add("required_color", f"Al menos 1 pokémon de color {rules['required_color']}")
    if rules["item_clause"]:
        add("item_clause", "Sin objetos repetidos", failed.get("item_clause", {}).get("names"))
    if any(e.get("league_legal") is False for e in entries):
        add("not_legal", "Solo pokémon legales en la liga", failed.get("not_legal", {}).get("names"))
    if any(e.get("is_ultra_beast") for e in entries):
        add("ultra_beast", "Sin Ultra Beasts", failed.get("ultra_beast", {}).get("names"))
    labels = {"max_paradox": "Paradox", "max_pseudo_legendary": "pseudo-legendarios",
              "max_restricted": "legendarios restringidos"}
    for key, flag in (DEX_LIMITS if lineup else ()):
        hits = _flagged(entries, flag)
        rows.append({"rule": key, "label": f"Máximo {rules[key]} {labels[key]} ({len(hits)}/{rules[key]})",
                     "ok": key not in failed, "names": hits if key in failed else []})
    return rows
