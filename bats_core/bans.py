"""
bats_core/bans.py
============
Lógica de negocio para la gestión de bans oficiales del torneo BATS (CLI).

Reglas:
    * Cada jugador puede registrar exactamente 1 ban activo por temporada.
    * Los Pokémon se validan contra la PokéAPI antes de ser baneados.
    * Los metadatos del pokémon se upsertean en tournament.pokemon_cache.
    * Un ban puede ser revocado por el admin (is_active = FALSE).

Uso típico::

    from bats_core.db.connection import BATSDatabase
    from bats_core.bans import register_ban, revoke_ban, list_bans

    with BATSDatabase() as db:
        result = register_ban(db, "campixx21", "Garchomp")
        bans = list_bans(db)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from .pokeapi import PokeAPIClient, PokeAPIError

if TYPE_CHECKING:
    from .db.connection import BATSDatabase

logger = logging.getLogger(__name__)


# =============================================================================
# Helpers internos
# =============================================================================

def _get_active_season_id(db: "BATSDatabase") -> int:
    row = db.fetchone(
        """
        SELECT season_id FROM tournament.seasons
        WHERE is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1
        """
    )
    if row is None:
        raise ValueError(
            "No hay ninguna temporada activa en tournament.seasons. "
            "Crea una temporada antes de registrar bans."
        )
    return int(row["season_id"])


def _upsert_pokemon_cache(
    db: "BATSDatabase",
    name: str,
    national_dex: int | None,
    types: str | None,
    sprite_url: str | None,
) -> int:
    """Upsertea en tournament.pokemon_cache y retorna el pokemon_id."""
    row = db.fetchone(
        "SELECT tournament.upsert_pokemon_cache(%s, %s, %s, %s) AS pokemon_id",
        (name, national_dex, types, sprite_url),
    )
    assert row is not None
    return int(row["pokemon_id"])


# =============================================================================
# API pública del módulo
# =============================================================================

def register_ban(
    db: "BATSDatabase",
    player_username: str,
    pokemon_name: str,
) -> dict:
    """
    Registra el ban oficial de un Pokémon para un jugador en la temporada activa.

    Proceso:
        1. Obtiene la temporada activa.
        2. Valida el Pokémon en la PokéAPI.
        3. Upsertea metadatos en tournament.pokemon_cache.
        4. Verifica que el jugador no tenga ya un ban activo esta temporada.
        5. Verifica que el Pokémon no esté ya baneado esta temporada.
        6. Inserta en tournament.bans con pokemon_id.

    Returns:
        dict con: player, pokemon, types, sprite_url, banned_at.

    Raises:
        ValueError: Si el jugador ya tiene ban, el pokemon ya está baneado,
                    o no hay temporada activa.
        PokeAPIError: Si falla la consulta a PokéAPI.
    """
    logger.info("Registrando ban: jugador='%s', pokémon='%s'", player_username, pokemon_name)

    season_id = _get_active_season_id(db)

    # Validar Pokémon en PokéAPI
    client = PokeAPIClient()
    try:
        species_info = client.get_species_info(pokemon_name)
    except PokeAPIError as exc:
        raise PokeAPIError(
            f"No se pudo consultar la PokéAPI para validar '{pokemon_name}': {exc.message}"
        ) from exc

    if species_info is None:
        raise ValueError(
            f"Pokémon '{pokemon_name}' no encontrado en la PokéAPI. "
            "Verifica el nombre e inténtalo de nuevo."
        )

    display_name: str       = species_info["display_name"]
    types_str: str          = species_info["types"]
    sprite_url: str | None  = species_info["sprite_url"]
    national_dex: int | None = species_info.get("national_dex")

    # Upsertear en pokemon_cache
    pokemon_id = _upsert_pokemon_cache(db, display_name, national_dex, types_str, sprite_url)

    # Verificar que el jugador no tenga ban activo esta temporada
    existing_player_ban = db.fetchone(
        """
        SELECT b.ban_id, pc.name AS pokemon_name
        FROM tournament.bans b
        JOIN tournament.pokemon_cache pc ON pc.pokemon_id = b.pokemon_id
        WHERE b.player_username = %s
          AND b.season_id       = %s
          AND b.is_active       = TRUE
        """,
        (player_username, season_id),
    )
    if existing_player_ban is not None:
        raise ValueError(
            f"El jugador '{player_username}' ya tiene un ban activo esta temporada: "
            f"'{existing_player_ban['pokemon_name']}'. Usa --revoke primero."
        )

    # Verificar que el Pokémon no esté ya baneado por otro jugador
    existing_pokemon_ban = db.fetchone(
        """
        SELECT b.ban_id, b.player_username AS other_player
        FROM tournament.bans b
        WHERE b.pokemon_id  = %s
          AND b.season_id   = %s
          AND b.is_active   = TRUE
        """,
        (pokemon_id, season_id),
    )
    if existing_pokemon_ban is not None:
        raise ValueError(
            f"'{display_name}' ya fue baneado por {existing_pokemon_ban['other_player']}. "
            "No se pueden duplicar bans del mismo Pokémon."
        )

    # Insertar ban oficial
    db.execute(
        """
        INSERT INTO tournament.bans (season_id, player_username, pokemon_id)
        VALUES (%s, %s, %s)
        """,
        (season_id, player_username, pokemon_id),
    )

    ban_row = db.fetchone(
        """
        SELECT banned_at FROM tournament.bans
        WHERE player_username = %s AND season_id = %s AND is_active = TRUE
        """,
        (player_username, season_id),
    )
    banned_at_str = (
        ban_row["banned_at"].isoformat()
        if ban_row and ban_row.get("banned_at")
        else datetime.now(timezone.utc).isoformat()
    )

    logger.info(
        "Ban registrado: %s baneó a %s (%s) — temporada %d",
        player_username, display_name, types_str, season_id,
    )

    return {
        "player":     player_username,
        "pokemon":    display_name,
        "types":      types_str,
        "sprite_url": sprite_url,
        "banned_at":  banned_at_str,
    }


def revoke_ban(db: "BATSDatabase", player_username: str) -> dict:
    """
    Revoca el ban activo de un jugador en la temporada activa.

    Marca is_active = FALSE y registra revoked_at. Conserva el historial.

    Returns:
        dict con: player, pokemon, types, banned_at, revoked_at.

    Raises:
        ValueError: Si el jugador no tiene ningún ban activo.
    """
    logger.info("Revocando ban del jugador '%s'", player_username)

    ban_row = db.fetchone(
        """
        SELECT b.ban_id, pc.name AS pokemon_name, pc.types AS pokemon_types, b.banned_at
        FROM tournament.bans b
        JOIN tournament.pokemon_cache pc ON pc.pokemon_id = b.pokemon_id
        WHERE b.player_username = %s AND b.is_active = TRUE
        """,
        (player_username,),
    )

    if ban_row is None:
        raise ValueError(
            f"El jugador '{player_username}' no tiene ningún ban activo. "
            "No hay nada que revocar."
        )

    ban_id = ban_row["ban_id"]

    db.execute(
        "UPDATE tournament.bans SET is_active = FALSE, revoked_at = NOW() WHERE ban_id = %s",
        (ban_id,),
    )

    revoked_row = db.fetchone(
        "SELECT revoked_at FROM tournament.bans WHERE ban_id = %s",
        (ban_id,),
    )
    revoked_at_str = (
        revoked_row["revoked_at"].isoformat()
        if revoked_row and revoked_row.get("revoked_at")
        else datetime.now(timezone.utc).isoformat()
    )

    banned_at_raw = ban_row.get("banned_at")
    banned_at_str = (
        banned_at_raw.isoformat()
        if hasattr(banned_at_raw, "isoformat")
        else str(banned_at_raw)
    )

    logger.info("Ban revocado: %s dejó de banear a %s", player_username, ban_row["pokemon_name"])

    return {
        "player":     player_username,
        "pokemon":    ban_row["pokemon_name"],
        "types":      ban_row.get("pokemon_types", ""),
        "banned_at":  banned_at_str,
        "revoked_at": revoked_at_str,
    }


def list_bans(db: "BATSDatabase") -> list[dict]:
    """Retorna la lista de bans activos desde tournament.v_active_bans."""
    return db.fetchall("SELECT * FROM tournament.v_active_bans")


def get_ban_list_for_report(db: "BATSDatabase") -> list[str]:
    """Retorna los nombres de Pokémon con ban activo (todas las temporadas)."""
    rows = db.fetchall(
        """
        SELECT pc.name
        FROM tournament.bans b
        JOIN tournament.pokemon_cache pc ON pc.pokemon_id = b.pokemon_id
        WHERE b.is_active = TRUE
        ORDER BY b.banned_at
        """
    )
    return [row["name"] for row in rows]
