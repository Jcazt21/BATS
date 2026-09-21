"""
bats_core/bot/bot.py
===============
Entry point del PGL-Bot.

Flujo:
  1. Genera un pool de 4 equipos válidos leyendo los bans actuales.
  2. Conecta al servidor PS local como "PGL-Bot".
  3. Acepta desafíos indefinidamente en el formato PinchesGueys League.
  4. Después de cada batalla envía un PM con el análisis al jugador.

Uso:
    python -m bats_core bot

Opciones:
    python -m bats_core bot --username MiBot --host localhost --port 8000
"""

from __future__ import annotations

import asyncio
import logging
import sys

import random as _random
from poke_env import AccountConfiguration, ServerConfiguration
from poke_env.teambuilder import Teambuilder

from .config import (
    BOT_USERNAME,
    BOT_PASSWORD,
    SERVER_HOST,
    SERVER_PORT,
    BATTLE_FORMAT,
    rules_drift,
)
from .player import PGLPlayer
from .team_builder import build_team_pool

logger = logging.getLogger(__name__)


# ─── Teambuilder rotativo ─────────────────────────────────────────────────────

class RotatingTeambuilder(Teambuilder):
    """Rota aleatoriamente entre un pool de equipos en cada batalla."""

    def __init__(self, teams: list[str]):
        self._packed_teams = [
            self.join_team(self.parse_showdown_team(t)) for t in teams
        ]

    def yield_team(self) -> str:
        return _random.choice(self._packed_teams)


# ─── Configuración de servidor local ─────────────────────────────────────────

def make_server_config(host: str, port: int) -> ServerConfiguration:
    return ServerConfiguration(
        websocket_url=f"ws://{host}:{port}/showdown/websocket",
        authentication_url="https://play.pokemonshowdown.com/action.php?",
    )


# ─── Runner principal ─────────────────────────────────────────────────────────

async def run_bot(
    username: str = BOT_USERNAME,
    password: str | None = BOT_PASSWORD,
    host: str = SERVER_HOST,
    port: int = SERVER_PORT,
    battle_format: str = BATTLE_FORMAT,
    team_pool_size: int = 4,
) -> None:
    """
    Arranca el PGL-Bot y lo deja aceptando desafíos indefinidamente.

    Args:
        username:        Nombre del bot en PS.
        password:        Contraseña (None para servidor local sin auth).
        host:            Host del servidor PS.
        port:            Puerto del servidor PS.
        battle_format:   ID del formato (default: gen9pinchesgueys).
        team_pool_size:  Número de equipos distintos a generar.
    """
    drift = rules_drift()
    if drift:
        print(f"[PGL-Bot] ADVERTENCIA: {drift}", file=sys.stderr)

    print(f"[PGL-Bot] Generando {team_pool_size} equipos...")
    try:
        teams = build_team_pool(n=team_pool_size)
    except RuntimeError as exc:
        print(f"[PGL-Bot] ERROR al generar equipos: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"[PGL-Bot] {len(teams)} equipo(s) listo(s).")

    teambuilder = RotatingTeambuilder(teams)

    account_config = AccountConfiguration(username, password)
    server_config = make_server_config(host, port)

    bot = PGLPlayer(
        account_configuration=account_config,
        server_configuration=server_config,
        battle_format=battle_format,
        team=teambuilder,
        max_concurrent_battles=1,  # Un desafío a la vez
    )

    print(f"[PGL-Bot] Conectando a {host}:{port} como '{username}'...")
    print(f"[PGL-Bot] Formato: {battle_format}")
    print(f"[PGL-Bot] Listo. Desafiame con: /challenge {username},[Gen 9] PinchesGueys League")
    print("[PGL-Bot] Ctrl+C para detener.\n")

    try:
        while True:
            # Reconstruye equipos en cada batalla: respeta bans actualizados
            # y descarta equipos inválidos automáticamente al reintentar.
            try:
                new_teams = build_team_pool(n=team_pool_size)
                bot._team = RotatingTeambuilder(new_teams)
            except RuntimeError as exc:
                print(f"[PGL-Bot] No se pudo armar equipo: {exc}. Reintentando en 5s...")
                await asyncio.sleep(5)
                continue

            try:
                await bot.accept_challenges(None, n_challenges=1)
            except Exception as exc:
                logger.warning("Error en batalla, reintentando: %s", exc)
                await asyncio.sleep(2)
    except KeyboardInterrupt:
        print("\n[PGL-Bot] Detenido por el usuario.")


def main(
    username: str = BOT_USERNAME,
    password: str | None = BOT_PASSWORD,
    host: str = SERVER_HOST,
    port: int = SERVER_PORT,
) -> None:
    """Punto de entrada síncrono (llamado desde el CLI de BATS)."""
    asyncio.run(run_bot(username=username, password=password, host=host, port=port))
