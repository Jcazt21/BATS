"""
BATS — Forma canónica de un set de Showdown.

Es el contrato que compara config/formats.ts en batalla: si el set que trae el
jugador no produce la misma cadena que uno de sus sets registrados, el formato
lo rechaza. La versión TypeScript debe mantenerse en paridad con este módulo.
"""
import re


STATS = ("hp", "atk", "def", "spa", "spd", "spe")
STAT_LABELS = {
    "hp": "HP", "atk": "Atk", "def": "Def",
    "spa": "SpA", "spd": "SpD", "spe": "Spe",
}


def to_id(value) -> str:
    """Equivalente al ``toID`` de Showdown para los campos del set."""
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _spread(raw: dict | None, default: int) -> str:
    values = {to_id(key): value for key, value in (raw or {}).items()}
    return ",".join(str(int(values.get(stat, default))) for stat in STATS)


def canonical_set(entry: dict, primary_type: str | None = None) -> str:
    """Devuelve la representación estable que BATS y Showdown comparan."""
    moves = sorted(to_id(move) for move in (entry.get("moves") or []) if to_id(move))
    tera = to_id(entry.get("tera_type")) or to_id(primary_type)
    return "|".join([
        to_id(entry.get("name") or entry.get("species")),
        to_id(entry.get("held_item")),
        to_id(entry.get("ability")),
        to_id(entry.get("nature")),
        tera,
        ",".join(moves),
        _spread(entry.get("evs"), 0),
        _spread(entry.get("ivs"), 31),
    ])


def _paste_spread(raw: dict | None) -> str:
    values = {to_id(key): value for key, value in (raw or {}).items()}
    return " / ".join(
        f"{int(values[stat])} {STAT_LABELS[stat]}"
        for stat in STATS
        if stat in values
    )


def to_paste(entry: dict) -> str:
    """Serializa un set al formato de importación del TeamValidator de Showdown."""
    name = str(entry.get("name") or entry.get("species") or "").strip()
    item = str(entry.get("held_item") or "").strip()
    lines = [f"{name} @ {item}" if item else name]
    if entry.get("ability"):
        lines.append(f"Ability: {entry['ability']}")
    if entry.get("tera_type"):
        lines.append(f"Tera Type: {entry['tera_type']}")
    if entry.get("evs"):
        lines.append(f"EVs: {_paste_spread(entry['evs'])}")
    if entry.get("nature"):
        lines.append(f"{entry['nature']} Nature")
    if entry.get("ivs"):
        lines.append(f"IVs: {_paste_spread(entry['ivs'])}")
    lines.extend(f"- {move}" for move in (entry.get("moves") or []))
    return "\n".join(lines)
