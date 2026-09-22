"""
BATS — Espejo del dex de Showdown.

El snapshot lo genera tools/export_dex.js desde el fork de PS. Aquí se importa a
tournament.dex_species para que la API valide equipos con los mismos datos que usa
config/formats.ts, sin depender de PokéAPI ni del body del cliente.
"""
import json
from pathlib import Path

COLUMNS = ("species_id", "name", "national_dex", "types", "color", "generation", "egg_groups",
           "bst", "tags", "base_species", "sprite_id", "is_restricted", "is_paradox",
           "is_pseudo", "is_ultra_beast", "league_legal")


def _row(sp: dict) -> tuple:
    return (
        sp["id"], sp["name"], sp.get("num"), " / ".join(sp.get("types") or []),
        sp.get("color"), sp.get("gen"), sp.get("eggGroups") or [], sp.get("bst") or 0,
        sp.get("tags") or [], sp.get("baseSpecies"), sp.get("spriteid"),
        bool(sp.get("restricted")), bool(sp.get("paradox")), bool(sp.get("pseudo")),
        bool(sp.get("ultraBeast")), bool(sp.get("leagueLegal", True)),
    )


def import_snapshot(db, dex_dir: str | Path) -> dict:
    """Carga species.json y meta.json en la DB. Idempotente (upsert por species_id)."""
    dex_dir = Path(dex_dir)
    species = json.loads((dex_dir / "species.json").read_text())
    meta = json.loads((dex_dir / "meta.json").read_text())
    placeholders = ", ".join(["%s"] * len(COLUMNS))
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in COLUMNS if c != "species_id")
    for sp in species.values():
        db.execute(
            f"INSERT INTO tournament.dex_species ({', '.join(COLUMNS)}) VALUES ({placeholders}) "
            f"ON CONFLICT (species_id) DO UPDATE SET {updates}",
            _row(sp),
        )
    db.execute(
        """
        INSERT INTO tournament.dex_meta (only_row, generated_at, ps_commit, species_count, imported_at)
        VALUES (TRUE, %s, %s, %s, NOW())
        ON CONFLICT (only_row) DO UPDATE SET
            generated_at = EXCLUDED.generated_at, ps_commit = EXCLUDED.ps_commit,
            species_count = EXCLUDED.species_count, imported_at = NOW()
        """,
        (meta.get("generated_at"), meta.get("ps_commit"), len(species)),
    )
    return {"species": len(species), "ps_commit": meta.get("ps_commit")}


def _to_id(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def species_meta(db, names: list[str]) -> dict[str, dict]:
    """
    Metadatos de cada especie, indexados por el nombre TAL CUAL lo mandó el cliente.
    Resuelve por id de Showdown y por nombre en minúsculas; lo que no existe
    simplemente no aparece en el resultado (quien llama decide si es un error).
    """
    if not names:
        return {}
    keys = {n: _to_id(n) for n in names}
    rows = db.fetchall(
        "SELECT * FROM tournament.dex_species WHERE species_id = ANY(%s) OR LOWER(name) = ANY(%s)",
        (list(keys.values()), [n.lower() for n in names]),
    )
    by_id = {r["species_id"]: r for r in rows}
    by_name = {r["name"].lower(): r for r in rows}
    out = {}
    for original, key in keys.items():
        row = by_id.get(key) or by_name.get(original.lower())
        if row:
            out[original] = dict(row)
    return out
