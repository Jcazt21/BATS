"""
BATS API — Modelos Pydantic de los request bodies.

Antes cada router traía los suyos declarados inline, mezclados con los endpoints.
"""
from datetime import date
from typing import Any, List, Optional

from pydantic import BaseModel, Field


# ── Equipos (bats_core/api/routes/teams.py) ────────────────────────────────────

class PokemonEntry(BaseModel):
    name:         str
    national_dex: Optional[int]        = None
    types:        Optional[str]        = None
    sprite_url:   Optional[str]        = None
    held_item:    Optional[str]        = None
    ability:      Optional[str]        = None
    nature:       Optional[str]        = None
    tera_type:    Optional[str]        = None
    moves:        list[str]            = []
    evs:          dict[str, int]       = {}
    ivs:          dict[str, int]       = {}
    color:        Optional[str]        = None
    generation:   Optional[int]        = None
    egg_groups:   list[str]            = []


class RegisterRequest(BaseModel):
    pokemon:  list[PokemonEntry]


class AddPokemonRequest(BaseModel):
    pokemon: list[PokemonEntry]


class SwapRequest(BaseModel):
    remove_pokemon_id: int
    add: PokemonEntry


class ValidateRequest(BaseModel):
    pokemon: list[PokemonEntry]


# ── Bans (bats_core/api/routes/ban.py) ─────────────────────────────────────────

class SubmitBanRequest(BaseModel):
    pokemon_name:  str
    pokemon_types: str | None = None
    sprite_url:    str | None = None
    national_dex:  int | None = None


# ── Ingesta (bats_core/api/routes/ingest.py) ───────────────────────────────────

class IngestBattleRequest(BaseModel):
    # battle.fact_battles.battle_id es VARCHAR(80)
    battle_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,79}$", description="p.ej. gen9pinchesgueysleague-249")
    format: str = Field(pattern=r"^[a-z0-9]{1,60}$", description="id del formato, p.ej. gen9pinchesgueysleague")
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="YYYY-MM-DD")
    log: dict = Field(description="Contenido del .log.json de PS (p1, p2, winner, turns, log, ...)")


# ── Temporadas (bats_core/api/routes/seasons.py) ───────────────────────────────

class CreateSeasonRequest(BaseModel):
    season_name:      str
    type_of_month:    str
    start_date:       date
    max_team_size:    int = 8
    max_team_changes: int = 4
    restrictions:     dict = {}


class UpdateSeasonRequest(BaseModel):
    season_name:      str | None  = None
    type_of_month:    str | None  = None
    start_date:       date | None = None
    end_date:         date | None = None   # enviar None explícito borra la fecha
    clear_end_date:   bool        = False  # True → poner end_date = NULL
    is_active:        bool | None = None
    max_team_size:    Optional[int]  = None
    max_team_changes: Optional[int]  = None
    restrictions:     Optional[dict] = None


class AddBanRequest(BaseModel):
    player_username: str
    pokemon_name:    str  # debe existir en tournament.pokemon_cache


class AddWhitelistRequest(BaseModel):
    username: str


# ── Admin (bats_core/api/routes/admin.py) ──────────────────────────────────────

class AddAccountRequest(BaseModel):
    email:    str
    username: str
    is_admin: bool = False


class AddPlayerRequest(BaseModel):
    username: str


# ── Reglas de liga (bats_core/api/routes/leaguesettings.py) ───────────────────

class UpdateLeagueSettingsRequest(BaseModel):
    type_of_month:    Optional[str]        = None
    max_team_size:    Optional[int]        = None
    max_team_changes: Optional[int]        = None
    restrictions:     Optional[dict[str, Any]] = None  # merged into current


# ── ETL Cleaner / Ingestas (bats_core/api/routes/etl_cleaner.py) ──────────────

class DeleteFilesRequest(BaseModel):
    # Valores de `file_path` tal como los devuelve GET /files. Para batallas
    # empujadas por la API es 'push:<battle_id>'; para las cargadas antes de la
    # migración es la ruta absoluta que tenía el log en disco.
    file_paths: List[str]
