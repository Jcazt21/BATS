"""
bats_core/parser.py
==============
Parsing de archivos .log.json generados por Pokémon Showdown.

Cada archivo tiene estructura:
{
    "p1": str, "p2": str, "winner": str, "turns": int,
    "p1team": [...], "p2team": [...],
    "log": ["línea1", "línea2", ...]   ← eventos de batalla (pipe-delimited)
}

Eventos relevantes en 'log':
  |switch|p1a: Garchomp|...     → pokémon entra al campo
  |move|p1a: Garchomp|Earthquake|p2a: Ferrothorn  → movimiento usado
  |faint|p2a: Ferrothorn        → pokémon se desmaya (KO)
  |turn|N                       → inicio de turno N
  |win|PlayerName               → batalla finalizada
"""

import json
import re
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Regex para parseo de líneas de log ───────────────────────────────────────

# Captura: lado (p1/p2), pokémon usuario, movimiento, lado objetivo, pokémon objetivo
RE_MOVE = re.compile(
    r'^\|move\|(?P<side>p\d)a:\s*(?P<user>[^|]+)\|(?P<move>[^|]+)'
    r'(?:\|(?P<tside>p\d)a:\s*(?P<target>[^|]+))?'
)
# Captura: lado y pokémon que se desmaya
RE_FAINT = re.compile(r'^\|faint\|(?P<side>p\d)a:\s*(?P<pokemon>.+)$')

# Captura switch y drag — también captura la especie canónica (segundo campo, antes de la coma)
RE_SWITCH = re.compile(
    r'^\|(?:switch|drag)\|(?P<side>p\d)a:\s*(?P<nickname>[^|]+)\|(?P<species>[^,|]+)'
)

# Número de turno actual
RE_TURN = re.compile(r'^\|turn\|(?P<n>\d+)$')

# Ganador de la batalla
RE_WIN = re.compile(r'^\|win\|(?P<player>.+)$')


# ─── Estructuras de datos ─────────────────────────────────────────────────────

@dataclass
class PokemonStats:
    """Métricas de un pokémon individual en una batalla."""
    species: str
    player: str
    kills: int = 0            # KOs otorgados a pokémon rivales
    turns_active: int = 0     # Turnos que estuvo en el campo (Rondas_Sobrevividas)
    survived: bool = True     # True si no se desmayó al final
    final_hit: bool = False   # True si hizo el KO al último pokémon rival
    # Internos para tracking durante parseo
    _entry_turn: int = field(default=0, repr=False)


@dataclass
class BattleData:
    """Datos completos de una batalla parseada."""
    battle_id: str
    format: str
    date: str
    p1: str
    p2: str
    winner: str
    turns: int
    end_type: str             # "normal" | "forfeit"
    p1_team: list[str]        # Nombres de especie del equipo de p1
    p2_team: list[str]        # Nombres de especie del equipo de p2
    pokemon_stats: list[PokemonStats]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extract_species(team_data: list[dict]) -> list[str]:
    """
    Extrae nombres de especie desde el JSON del equipo.
    PS usa 'name' cuando el nombre difiere de la especie base,
    y 'species' como campo canónico.
    """
    result = []
    for mon in team_data:
        name = mon.get("species") or mon.get("name") or "Unknown"
        # Normalizar: quitar espacios extra y capitalizar
        result.append(name.strip())
    return result


def _parse_log_events(
    log_lines: list[str],
    p1_name: str,
    p2_name: str,
) -> list[PokemonStats]:
    """
    Itera sobre las líneas del log y construye estadísticas por pokémon.

    Lógica:
    - Al hacer switch, se registra el turno de entrada y se cierra el turno de salida.
    - Al usar un movimiento contra un objetivo, se registra como "último atacante".
    - Al producirse un faint, el último atacante recibe el KO.
    - El atacante del último faint antes de |win| recibe final_hit=True.
    """
    side_to_player = {"p1": p1_name, "p2": p2_name}

    # Mapa de apodos a especie canónica: (side, nickname) -> species
    # Se construye en tiempo real desde los eventos |switch|
    nickname_map: dict[tuple[str, str], str] = {}

    def resolve(side: str, name: str) -> str:
        """Convierte un apodo/nombre del log a la especie canónica."""
        return nickname_map.get((side, name.strip()), name.strip())

    # Pokémon activo por lado: side -> species (canónica)
    active: dict[str, str] = {}

    # Estadísticas acumuladas: (player, species) -> PokemonStats
    stats: dict[tuple[str, str], PokemonStats] = {}

    # Último atacante por objetivo: (target_side, target_species) -> (attacker_player, attacker_species)
    last_attacker: dict[tuple[str, str], tuple[str, str]] = {}

    current_turn = 0
    last_fainted: Optional[tuple[str, str]] = None  # Para asignar final_hit

    def get_or_create(player: str, species: str) -> PokemonStats:
        key = (player, species)
        if key not in stats:
            stats[key] = PokemonStats(
                species=species,
                player=player,
                _entry_turn=current_turn,
            )
        return stats[key]

    def close_active(side: str) -> None:
        """Acumula turnos activos del pokémon que sale del campo."""
        species = active.get(side)
        if not species:
            return
        player = side_to_player.get(side, side)
        key = (player, species)
        if key in stats:
            elapsed = current_turn - stats[key]._entry_turn
            stats[key].turns_active += max(elapsed, 0)

    for line in log_lines:
        line = line.strip()
        if not line:
            continue

        # ── Turno ──────────────────────────────────────────────────────────
        m = RE_TURN.match(line)
        if m:
            current_turn = int(m.group("n"))
            continue

        # ── Switch / Drag ───────────────────────────────────────────────────
        m = RE_SWITCH.match(line)
        if m:
            side    = m.group("side")
            nickname = m.group("nickname").strip()
            species  = m.group("species").strip()
            player   = side_to_player.get(side, side)

            # Registrar apodo → especie para resolver eventos futuros
            nickname_map[(side, nickname)] = species

            close_active(side)

            active[side] = species
            mon = get_or_create(player, species)
            mon._entry_turn = current_turn
            continue

        # ── Movimiento usado ────────────────────────────────────────────────
        m = RE_MOVE.match(line)
        if m:
            side   = m.group("side")
            user   = resolve(side, m.group("user"))
            player = side_to_player.get(side, side)
            tside  = m.group("tside")
            target = m.group("target")

            # Asegurar que el usuario existe en stats
            get_or_create(player, user)

            if tside and target:
                target_species = resolve(tside, target)
                last_attacker[(tside, target_species)] = (player, user)
            continue

        # ── Faint ───────────────────────────────────────────────────────────
        m = RE_FAINT.match(line)
        if m:
            side    = m.group("side")
            species = resolve(side, m.group("pokemon"))
            player  = side_to_player.get(side, side)

            mon = get_or_create(player, species)
            mon.survived = False
            elapsed = current_turn - mon._entry_turn
            mon.turns_active += max(elapsed, 0)

            # Dar KO al último atacante
            attacker_key = last_attacker.get((side, species))
            if attacker_key:
                get_or_create(*attacker_key).kills += 1

            last_fainted = (side, species)

            if active.get(side) == species:
                del active[side]
            continue

        # ── Victoria ────────────────────────────────────────────────────────
        m = RE_WIN.match(line)
        if m:
            if last_fainted:
                attacker_key = last_attacker.get(last_fainted)
                if attacker_key:
                    get_or_create(*attacker_key).final_hit = True
            continue

    # Finalizar turnos de los pokémon que sobrevivieron en el campo
    for side, species in active.items():
        player = side_to_player.get(side, side)
        key = (player, species)
        if key in stats:
            elapsed = current_turn - stats[key]._entry_turn
            stats[key].turns_active += max(elapsed, 0)

    return list(stats.values())


# ─── Entry point principal ────────────────────────────────────────────────────

def find_log_files(logs_dir: Path, fmt: str | None) -> list[Path]:
    """
    Busca recursivamente archivos .log.json en logs_dir.
    Si se especifica fmt, filtra solo los logs de ese formato.

    Estructura esperada: logs/<YYYY-MM>/<format>/<YYYY-MM-DD>/<id>.log.json

    Args:
        logs_dir: Directorio raíz donde buscar archivos.
        fmt:      Nombre del formato para filtrar. None = todos los formatos.

    Returns:
        Lista de Path ordenada con los archivos encontrados.

    Raises:
        FileNotFoundError: Si logs_dir no existe.
    """
    if not logs_dir.exists():
        raise FileNotFoundError(f"La carpeta de logs no existe: {logs_dir}")

    pattern = f"**/{fmt}/**/*.log.json" if fmt else "**/*.log.json"
    files = list(logs_dir.glob(pattern))

    # Excluir archivos del directorio node_modules o similares por si acaso
    files = [f for f in files if "node_modules" not in f.parts]

    return sorted(files)


def parse_battle_dict(
    data: dict,
    battle_id: str,
    date: str,
    fmt: str,
    source: str = "<payload>",
) -> Optional[BattleData]:
    """
    Parsea el contenido ya cargado de un .log.json de Pokémon Showdown.

    No toca el filesystem: ``battle_id``, ``date`` y ``fmt`` se reciben
    explícitos en vez de inferirse de la ruta del archivo. Es el punto de
    entrada de la ingesta por push (POST /api/ingest/battle).

    Args:
        data:      Contenido del log (p1, p2, winner, turns, log, ...).
        battle_id: Id de la batalla (el stem del archivo, p.ej. 'gen9ou-123').
        date:      Fecha 'YYYY-MM-DD'.
        fmt:       Id del formato (p.ej. 'gen9pinchesgueysleague').
        source:    Nombre para los mensajes de log (archivo o id).

    Retorna None si:
    - ``data`` no es un objeto.
    - Faltan campos obligatorios (p1, p2, winner, turns, log).
    - La batalla tiene menos de 3 turnos (batalla de prueba).
    """
    if not isinstance(data, dict):
        logger.warning("Contenido inválido en '%s': se esperaba un objeto JSON", source)
        return None

    # Validar campos mínimos requeridos
    required_fields = {"p1", "p2", "winner", "turns", "log"}
    missing = required_fields - data.keys()
    if missing:
        logger.warning("Campos faltantes en '%s': %s", source, missing)
        return None

    turns: int = data.get("turns", 0)

    # Regla de integridad: ignorar batallas de prueba (< 3 turnos)
    if turns < 3:
        logger.debug("Batalla de prueba ignorada '%s' (%d turnos)", source, turns)
        return None

    # Extraer equipos — pueden ser None si no se guardaron
    p1_team = _extract_species(data.get("p1team") or [])
    p2_team = _extract_species(data.get("p2team") or [])

    # Normalizar log: puede ser lista de strings o un string con saltos de línea
    raw_log = data.get("log", [])
    log_lines: list[str] = raw_log if isinstance(raw_log, list) else raw_log.split("\n")

    p1: str = data["p1"]
    p2: str = data["p2"]

    pokemon_stats = _parse_log_events(log_lines, p1, p2)

    return BattleData(
        battle_id=battle_id,
        format=fmt,
        date=date,
        p1=p1,
        p2=p2,
        winner=data.get("winner", ""),
        turns=turns,
        end_type=data.get("endType", "normal"),
        p1_team=p1_team,
        p2_team=p2_team,
        pokemon_stats=pokemon_stats,
    )


def parse_battle_file(filepath: Path) -> Optional[BattleData]:
    """
    Parsea un único archivo .log.json de Pokémon Showdown.

    Wrapper sobre :func:`parse_battle_dict` que lee el archivo e infiere
    ``date``, ``format`` y ``battle_id`` de la ruta:
    logs/<YYYY-MM>/<format>/<YYYY-MM-DD>/<id>.log.json

    Retorna None si el archivo está corrupto o ilegible, o por cualquiera de
    las razones de :func:`parse_battle_dict`.
    """
    try:
        with filepath.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as exc:
        logger.warning("Archivo corrupto o ilegible '%s': %s", filepath.name, exc)
        return None

    parts = filepath.parts
    date = parts[-2] if len(parts) >= 2 else "unknown"
    fmt = parts[-3] if len(parts) >= 3 else (data.get("format", "unknown") if isinstance(data, dict) else "unknown")

    return parse_battle_dict(
        data,
        battle_id=filepath.stem.replace(".log", ""),
        date=date,
        fmt=fmt,
        source=filepath.name,
    )
