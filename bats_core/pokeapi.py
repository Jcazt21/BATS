"""
bats_core/pokeapi.py
===============
Wrapper ligero sobre la PokéAPI v2 con cache persistente en disco.

Usa únicamente la stdlib de Python (urllib.request, json, pathlib).
No requiere el paquete ``requests`` ni ninguna dependencia externa.

Cache:
    Los datos de cada Pokémon consultado se guardan como archivos JSON
    en ``bats_core/.pokeapi_cache/<nombre_normalizado>.json``. En consultas
    posteriores se sirven desde disco sin tocar la red.

Uso típico::

    from bats_core.pokeapi import PokeAPIClient, PokeAPIError

    client = PokeAPIClient()

    info = client.get_species_info("Garchomp")
    # {'display_name': 'Garchomp', 'types': 'Dragon / Ground',
    #  'sprite_url': 'https://...', 'base_stats': {...}, 'exists': True}

    info = client.get_species_info("asdfasdf")
    # None  (Pokémon no encontrado)
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Directorio de cache por defecto: bats_core/.pokeapi_cache/
_DEFAULT_CACHE_DIR = Path(__file__).parent / ".pokeapi_cache"

# Timeout en segundos para las peticiones HTTP
_HTTP_TIMEOUT = 10


class PokeAPIError(Exception):
    """
    Error de red o respuesta inesperada de la PokéAPI.

    Se lanza cuando la API devuelve un código de estado distinto de 200 o 404,
    o cuando ocurre un error de conectividad.

    Attributes:
        message: Descripción legible del error.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class PokeAPIClient:
    """
    Cliente de la PokéAPI v2 con cache en disco.

    Realiza peticiones GET a ``https://pokeapi.co/api/v2/pokemon/{name}``
    y guarda las respuestas JSON en disco para evitar peticiones repetidas.

    Args:
        cache_dir: Directorio donde se guardan los archivos de cache.
                   Por defecto: ``bats_core/.pokeapi_cache/``.
    """

    BASE_URL = "https://pokeapi.co/api/v2"

    def __init__(self, cache_dir: Optional[Path] = None) -> None:
        """
        Inicializa el cliente y crea el directorio de cache si no existe.

        Args:
            cache_dir: Ruta al directorio de cache. Si es None, usa
                       ``bats_core/.pokeapi_cache/``.
        """
        self.cache_dir: Path = cache_dir if cache_dir is not None else _DEFAULT_CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        logger.debug("PokeAPIClient inicializado. Cache: %s", self.cache_dir)

    # ─── Helpers internos ────────────────────────────────────────────────────

    def _cache_path(self, name: str) -> Path:
        """
        Retorna la ruta del archivo de cache para un nombre de Pokémon.

        Args:
            name: Nombre normalizado del Pokémon (ya en formato slug).

        Returns:
            Path al archivo JSON de cache.
        """
        return self.cache_dir / f"{name}.json"

    @staticmethod
    def _normalize(name: str) -> str:
        """
        Normaliza el nombre de un Pokémon al formato de slug de la PokéAPI.

        Transformaciones:
            - Strip de espacios en extremos
            - Conversión a minúsculas
            - Reemplazo de espacios internos por guiones

        Ejemplos:
            "Garchomp"    → "garchomp"
            "Iron Moth"   → "iron-moth"
            "Flutter Mane" → "flutter-mane"
            " Charizard " → "charizard"

        Args:
            name: Nombre del Pokémon tal como lo ingresó el usuario.

        Returns:
            Nombre normalizado como slug.
        """
        return name.strip().lower().replace(" ", "-")

    # ─── Petición HTTP ───────────────────────────────────────────────────────

    def get_pokemon(self, name: str) -> Optional[dict]:
        """
        Consulta la PokéAPI para obtener los datos completos de un Pokémon.

        Primero revisa el cache en disco. Si hay un hit, retorna el JSON
        guardado sin tocar la red. Si no, realiza un GET HTTP y guarda la
        respuesta en cache antes de retornarla.

        Args:
            name: Nombre del Pokémon (cualquier capitalización, con o sin
                  espacios). Se normaliza internamente.

        Returns:
            Diccionario con el JSON completo de la PokéAPI, o None si el
            Pokémon no existe (HTTP 404).

        Raises:
            PokeAPIError: Si ocurre un error de red o la API retorna un
                          código de estado inesperado (distinto de 200/404).
        """
        normalized = self._normalize(name)
        cache_file = self._cache_path(normalized)

        # ── Cache hit ────────────────────────────────────────────────────────
        if cache_file.exists():
            logger.debug("Cache hit para '%s' → %s", normalized, cache_file)
            try:
                return json.loads(cache_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                # Cache corrupto: eliminar y consultar de nuevo
                logger.warning("Cache corrupto para '%s': %s. Re-consultando API.", normalized, exc)
                cache_file.unlink(missing_ok=True)

        # ── Petición HTTP ─────────────────────────────────────────────────────
        url = f"{self.BASE_URL}/pokemon/{normalized}"
        logger.debug("GET %s", url)

        req = urllib.request.Request(
            url,
            headers={"User-Agent": "BATS-PokemonShowdown/1.0 (tournament tracker)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as response:
                raw = response.read()
                data: dict = json.loads(raw)

        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                logger.debug("Pokémon '%s' no encontrado (404).", normalized)
                return None
            raise PokeAPIError(
                f"La PokéAPI retornó HTTP {exc.code} para '{name}': {exc.reason}"
            ) from exc

        except urllib.error.URLError as exc:
            raise PokeAPIError(
                f"Error de red al consultar la PokéAPI para '{name}': {exc.reason}"
            ) from exc

        except (json.JSONDecodeError, OSError) as exc:
            raise PokeAPIError(
                f"Error procesando la respuesta de la PokéAPI para '{name}': {exc}"
            ) from exc

        # ── Guardar en cache ──────────────────────────────────────────────────
        try:
            cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            logger.debug("Respuesta guardada en cache: %s", cache_file)
        except OSError as exc:
            # No fatal: el cache es una optimización, no un requisito
            logger.warning("No se pudo guardar el cache para '%s': %s", normalized, exc)

        return data

    # ─── Info enriquecida ────────────────────────────────────────────────────

    def get_species_info(self, name: str) -> Optional[dict]:
        """
        Retorna información enriquecida y resumida de un Pokémon.

        Internamente llama a ``get_pokemon`` y extrae los campos relevantes
        para el módulo de bans: nombre display, tipos, sprite y base stats.

        Args:
            name: Nombre del Pokémon (cualquier capitalización).

        Returns:
            Diccionario con las claves:
                - ``display_name`` (str): Nombre capitalizado del Pokémon.
                  Para Pokémon con guiones en el nombre canónico (ej:
                  "flutter-mane") se capitaliza la primera letra.
                - ``types`` (str): Tipos separados por " / ".
                  Ej: "Dragon / Ground", "Ghost / Fairy".
                - ``sprite_url`` (str | None): URL del sprite frontal oficial.
                  Puede ser None si la PokéAPI no tiene sprite para esa forma.
                - ``base_stats`` (dict): Diccionario con las 6 estadísticas
                  base: hp, attack, defense, sp_atk, sp_def, speed.
                - ``exists`` (bool): Siempre True cuando se retorna este dict.

            None si el Pokémon no existe en la PokéAPI.

        Raises:
            PokeAPIError: Si ocurre un error de red al consultar la API.
        """
        data = self.get_pokemon(name)
        if data is None:
            return None

        # ── Nombre display ────────────────────────────────────────────────────
        # Usamos el nombre del endpoint de especie del Pokémon (campo "name"
        # en la respuesta), que es el slug canónico. Lo capitalizamos
        # correctamente: cada segmento separado por guión va en Title Case.
        raw_name: str = data.get("name", self._normalize(name))
        display_name = " ".join(part.capitalize() for part in raw_name.split("-"))

        # ── Tipos ─────────────────────────────────────────────────────────────
        types_raw: list[dict] = data.get("types", [])
        # Ordenar por slot para garantizar el orden primario/secundario
        types_sorted = sorted(types_raw, key=lambda t: t.get("slot", 99))
        type_names = [
            t["type"]["name"].capitalize()
            for t in types_sorted
            if "type" in t and "name" in t["type"]
        ]
        types_str = " / ".join(type_names) if type_names else ""

        # ── Sprite ────────────────────────────────────────────────────────────
        sprites: dict = data.get("sprites", {})
        sprite_url: Optional[str] = sprites.get("front_default")

        # ── Base stats ────────────────────────────────────────────────────────
        stats_raw: list[dict] = data.get("stats", [])
        stat_map = {
            "hp":              "hp",
            "attack":          "attack",
            "defense":         "defense",
            "special-attack":  "sp_atk",
            "special-defense": "sp_def",
            "speed":           "speed",
        }
        base_stats: dict[str, int] = {v: 0 for v in stat_map.values()}
        for stat_entry in stats_raw:
            api_name: str = stat_entry.get("stat", {}).get("name", "")
            if api_name in stat_map:
                base_stats[stat_map[api_name]] = stat_entry.get("base_stat", 0)

        logger.debug(
            "Pokémon encontrado: %s | tipos: %s | sprite: %s",
            display_name, types_str, sprite_url,
        )

        return {
            "display_name": display_name,
            "types":        types_str,
            "sprite_url":   sprite_url,
            "base_stats":   base_stats,
            "exists":       True,
        }
