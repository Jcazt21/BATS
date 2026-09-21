"""
bats_core/db/etl.py
==============
Pipeline ETL para BATS: carga datos de batallas parseadas hacia PostgreSQL.

Flujo principal:
    1. Descubrir archivos .log.json con find_log_files (de bats_core.parser).
    2. Parsear cada archivo con parse_battle_file (de bats_core.parser).
    3. Cargar cada BattleData en la DB con BATSEtl.load_battle().
    4. Refrescar las vistas materializadas al finalizar.

Garantías de idempotencia:
    * Se consulta battle.etl_log antes de procesar cada archivo.
    * Todos los INSERT usan ON CONFLICT DO NOTHING / DO UPDATE.
    * Cada batalla es su propia transacción; un fallo no afecta las demás.

Fórmula MVP:
    La calcula la propia DB (columna generada mvp_score, ver v10.sql y bats_core/mvp.py);
    el ETL solo inserta los hechos crudos.

Uso típico::

    from pathlib import Path
    from bats_core.db.connection import BATSDatabase
    from bats_core.db.etl import run_etl

    with BATSDatabase() as db:
        stats = run_etl(Path("logs/"), db, verbose=True)
        print(f"Cargadas: {stats['loaded']}, Skipped: {stats['skipped']}")
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from bats_core.parser import BattleData
    from bats_core.db.connection import BATSDatabase

logger = logging.getLogger(__name__)

# Clave en battle.etl_log.file_path para batallas ingeridas por push (no hay archivo).
PUSH_KEY_PREFIX = "push:"


# =============================================================================
# Clase principal ETL
# =============================================================================

class BATSEtl:
    """
    Pipeline ETL para cargar datos de batallas en PostgreSQL.

    Cada instancia está asociada a una conexión de base de datos activa.
    Las operaciones de carga son idempotentes: correr el ETL dos veces
    sobre los mismos archivos no genera duplicados.

    Args:
        db: Instancia de BATSDatabase con conexión activa.
    """

    def __init__(self, db: "BATSDatabase") -> None:
        self.db = db

    # ─── Métodos dimension: get or create ─────────────────────────────────────

    def _get_or_create_player(self, username: str, battle_date: str) -> int:
        """
        Obtiene o crea un registro en battle.dim_players.

        Actualiza last_seen en cada upsert. is_bot no se modifica aquí;
        PGL-Bot ya está pre-insertado con is_bot=TRUE en el seed.
        """
        parsed_date: date
        try:
            parsed_date = date.fromisoformat(battle_date)
        except (ValueError, TypeError):
            parsed_date = date.today()

        sql = """
            INSERT INTO battle.dim_players (username, first_seen, last_seen)
            VALUES (%s, %s, %s)
            ON CONFLICT (username) DO UPDATE
                SET last_seen = GREATEST(battle.dim_players.last_seen, EXCLUDED.last_seen)
            RETURNING player_id
        """
        row = self.db.fetchone(sql, (username, parsed_date, parsed_date))
        if row is None:
            row = self.db.fetchone(
                "SELECT player_id FROM battle.dim_players WHERE username = %s",
                (username,),
            )
        assert row is not None, f"No se pudo obtener player_id para '{username}'"
        return int(row["player_id"])

    def _get_or_create_pokemon_bulk(self, species: set[str]) -> dict[str, int]:
        """
        Obtiene o crea en battle.dim_pokemon todas las especies de una batalla con
        2 queries (antes 2 por especie: ~24 viajes a la DB por batalla).
        """
        names = sorted(sp for sp in species if sp)
        if not names:
            return {}
        self.db.execute(
            "INSERT INTO battle.dim_pokemon (species) SELECT unnest(%s::text[]) "
            "ON CONFLICT (species) DO NOTHING",
            (names,),
        )
        rows = self.db.fetchall(
            "SELECT species, pokemon_id FROM battle.dim_pokemon WHERE species = ANY(%s)",
            (names,),
        )
        return {r["species"]: int(r["pokemon_id"]) for r in rows}

    def _get_or_create_format(self, format_name: str) -> int:
        """Obtiene o crea un registro en battle.dim_formats."""
        sql = """
            INSERT INTO battle.dim_formats (format_name)
            VALUES (%s)
            ON CONFLICT (format_name) DO NOTHING
            RETURNING format_id
        """
        row = self.db.fetchone(sql, (format_name,))
        if row is None:
            row = self.db.fetchone(
                "SELECT format_id FROM battle.dim_formats WHERE format_name = %s",
                (format_name,),
            )
        assert row is not None, f"No se pudo obtener format_id para '{format_name}'"
        return int(row["format_id"])

    # ─── Control de idempotencia ──────────────────────────────────────────────

    def _is_already_processed(self, file_path: str, battle_id: str | None = None) -> bool:
        """
        Verifica si una batalla ya fue procesada exitosamente en battle.etl_log.

        La clave primaria es ``file_path`` (logs leídos de disco: ruta absoluta;
        batallas empujadas por la API: ``push:<battle_id>``). Si se pasa
        ``battle_id`` también se considera procesada cuando ese mismo id ya se
        cargó bajo otra clave, para que un log ingerido por push y luego leído
        de disco (o al revés) no se cargue dos veces.
        """
        row = self.db.fetchone(
            """
            SELECT log_id FROM battle.etl_log
            WHERE status = 'ok' AND (file_path = %s OR (%s IS NOT NULL AND battle_id = %s))
            LIMIT 1
            """,
            (file_path, battle_id, battle_id),
        )
        return row is not None

    # ─── Carga de una batalla ─────────────────────────────────────────────────

    def load_battle(self, battle: "BattleData", file_path: str) -> bool:
        """
        Carga una batalla completa en la base de datos.

        Detecta automáticamente si es una batalla contra el bot (is_bot_battle)
        revisando is_bot en battle.dim_players para p1 y p2.

        Returns:
            True si fue cargada. False si fue skipped (ya procesada).
        """
        if self._is_already_processed(file_path, battle.battle_id):
            logger.debug("Skipped (ya procesado): %s", file_path)
            return False

        file_size = _get_file_size(file_path)

        try:
            # ── 1. Resolver dimensiones ──────────────────────────────────────
            p1_id     = self._get_or_create_player(battle.p1, battle.date)
            p2_id     = self._get_or_create_player(battle.p2, battle.date)
            format_id = self._get_or_create_format(battle.format)

            winner_id: int | None = None
            if battle.winner:
                if battle.winner == battle.p1:
                    winner_id = p1_id
                elif battle.winner == battle.p2:
                    winner_id = p2_id
                else:
                    winner_id = self._get_or_create_player(battle.winner, battle.date)

            # Pre-cargar IDs de todos los pokémon del battle para eficiencia
            all_species: set[str] = set()
            for stat in battle.pokemon_stats:
                all_species.add(stat.species)
            for sp in battle.p1_team + battle.p2_team:
                all_species.add(sp)

            species_to_id = self._get_or_create_pokemon_bulk(all_species)

            # ── 2. Resolver season_id por fecha de batalla ───────────────────
            season_row = self.db.fetchone(
                """
                SELECT season_id FROM tournament.seasons
                WHERE %s BETWEEN start_date AND COALESCE(end_date, CURRENT_DATE)
                ORDER BY start_date DESC
                LIMIT 1
                """,
                (_parse_date(battle.date),),
            )
            season_id: int | None = int(season_row["season_id"]) if season_row else None

            # ── 3. Detectar batalla contra bot ───────────────────────────────
            row = self.db.fetchone(
                """
                SELECT bool_or(is_bot) AS is_bot_battle
                FROM battle.dim_players
                WHERE player_id = ANY(%s)
                """,
                ([p1_id, p2_id],),
            )
            is_bot_battle = bool(row["is_bot_battle"]) if row and row["is_bot_battle"] else False

            if is_bot_battle:
                self.db.conn.cursor().execute(
                    """
                    INSERT INTO battle.etl_log (file_path, file_size, battle_id, status, error_msg)
                    VALUES (%s, %s, %s, 'skipped', 'Batalla contra bot ignorada')
                    ON CONFLICT (file_path) DO UPDATE
                        SET status       = 'skipped',
                            processed_at = NOW(),
                            battle_id    = EXCLUDED.battle_id,
                            error_msg    = 'Batalla contra bot ignorada'
                    """,
                    (file_path, file_size, battle.battle_id),
                )
                self.db.commit()
                logger.debug("Bot battle ignorada: %s", battle.battle_id)
                return False

            # ── 4. Insertar battle.fact_battles ──────────────────────────────
            self.db.conn.cursor().execute(
                """
                INSERT INTO battle.fact_battles
                    (battle_id, format_id, battle_date, p1_id, p2_id,
                     winner_id, total_turns, end_type, is_bot_battle, season_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (battle_id) DO NOTHING
                """,
                (
                    battle.battle_id, format_id, _parse_date(battle.date),
                    p1_id, p2_id, winner_id, battle.turns,
                    battle.end_type or "normal", is_bot_battle, season_id,
                ),
            )

            # ── 5-6. Insertar battle.fact_pokemon_performance (activos y banca) ──
            # Un solo INSERT multi-fila. Los activos van primero: ante una clave
            # repetida gana la primera (ON CONFLICT DO NOTHING), igual que antes.
            # mvp_score no se inserta: es una columna generada.
            player_map = {battle.p1: p1_id, battle.p2: p2_id}
            inserted_perf_keys: set[tuple[str, str]] = set()
            perf_rows: list[tuple] = []

            for stat in battle.pokemon_stats:
                player_id = player_map.get(stat.player)
                if player_id is None:
                    player_id = self._get_or_create_player(stat.player, battle.date)
                    player_map[stat.player] = player_id
                perf_rows.append((
                    battle.battle_id, player_id, species_to_id[stat.species],
                    stat.kills, stat.turns_active, stat.survived, stat.final_hit, True,
                ))
                inserted_perf_keys.add((stat.player, stat.species))

            for player_username, team in ((battle.p1, battle.p1_team), (battle.p2, battle.p2_team)):
                player_id = player_map.get(player_username)
                if player_id is None:
                    continue
                for species in team:
                    if not species or (player_username, species) in inserted_perf_keys:
                        continue
                    perf_rows.append((
                        battle.battle_id, player_id, species_to_id[species], 0, 0, True, False, False,
                    ))

            if perf_rows:
                import psycopg2.extras   # import diferido, como en connection.py

                psycopg2.extras.execute_values(
                    self.db.conn.cursor(),
                    """
                    INSERT INTO battle.fact_pokemon_performance
                        (battle_id, player_id, pokemon_id, kills, turns_active,
                         survived, final_hit, was_active)
                    VALUES %s
                    ON CONFLICT (battle_id, player_id, pokemon_id) DO NOTHING
                    """,
                    perf_rows,
                )

            # ── 7. Detectar violaciones de ban y de equipo ───────────────────
            if season_id is not None:
                self._detect_ban_violations(battle.battle_id)
                self._detect_team_violations(battle.battle_id)

            # ── 8. Registrar éxito en battle.etl_log ─────────────────────────
            self.db.conn.cursor().execute(
                """
                INSERT INTO battle.etl_log (file_path, file_size, battle_id, status)
                VALUES (%s, %s, %s, 'ok')
                ON CONFLICT (file_path) DO UPDATE
                    SET status       = 'ok',
                        processed_at = NOW(),
                        battle_id    = EXCLUDED.battle_id,
                        error_msg    = NULL
                """,
                (file_path, file_size, battle.battle_id),
            )

            self.db.commit()
            logger.debug("Batalla cargada: %s (bot=%s)", battle.battle_id, is_bot_battle)
            return True

        except Exception as exc:
            try:
                self.db.rollback()
            except Exception:
                pass
            _log_error(self.db, file_path, file_size, battle.battle_id, exc)
            logger.error("Error cargando batalla '%s': %s", battle.battle_id, exc)
            raise

    # ─── Detección de violaciones de ban ─────────────────────────────────────

    def _detect_ban_violations(self, battle_id: str) -> None:
        """
        Inserta en battle.fact_ban_violations cualquier pokémon baneado que
        aparezca en el equipo de un jugador en la batalla indicada.

        Usa un único INSERT-SELECT server-side. Idempotente: ON CONFLICT DO NOTHING.
        """
        self.db.conn.cursor().execute(
            """
            INSERT INTO battle.fact_ban_violations
                (battle_id, season_id, player_id, pokemon_id, ban_id, was_active)
            SELECT
                fpp.battle_id,
                fb.season_id,
                fpp.player_id,
                fpp.pokemon_id,
                b.ban_id,
                fpp.was_active
            FROM battle.fact_pokemon_performance fpp
            JOIN battle.fact_battles      fb  ON fb.battle_id      = fpp.battle_id
            JOIN battle.dim_players       dpl ON dpl.player_id     = fpp.player_id
            JOIN battle.dim_pokemon       dp  ON dp.pokemon_id     = fpp.pokemon_id
            JOIN tournament.bans          b   ON b.player_username = dpl.username
                                             AND b.season_id       = fb.season_id
                                             AND b.is_active       = TRUE
            JOIN tournament.pokemon_cache pc  ON pc.pokemon_id     = b.pokemon_id
                                             AND LOWER(pc.name)    = LOWER(dp.species)
            WHERE fpp.battle_id = %s
            ON CONFLICT (battle_id, player_id, pokemon_id) DO NOTHING
            """,
            (battle_id,),
        )

    # ─── Detección de violaciones de equipo ──────────────────────────────────

    def _detect_team_violations(self, battle_id: str) -> None:
        """
        Verifica las reglas de roster por jugador en una batalla:

        1. not_in_roster        – usó un pokémon que no está en su pool registrado (8)
        2. no_roster_registered – no tiene equipo registrado para la temporada
        3. rotation_exceeded    – cambió su lineup activo pero ya agotó sus rotaciones

        El "lineup activo" es el conjunto de 6 pokémon que el jugador lleva a cada
        batalla. Se detecta automáticamente comparando la batalla actual con la
        anterior. Si el conjunto difiere → intento de rotación.
        """
        cur = self.db.conn.cursor()

        # ── Info de la batalla ────────────────────────────────────────────────
        fb = self.db.fetchone(
            """
            SELECT fb.season_id, s.max_team_changes
            FROM battle.fact_battles fb
            JOIN tournament.seasons s ON s.season_id = fb.season_id
            WHERE fb.battle_id = %s
            """,
            (battle_id,),
        )
        if not fb:
            return
        season_id       = fb["season_id"]
        max_changes     = fb["max_team_changes"]

        # ── Jugadores humanos en esta batalla ─────────────────────────────────
        players = self.db.fetchall(
            """
            SELECT DISTINCT fpp.player_id, dpl.username
            FROM battle.fact_pokemon_performance fpp
            JOIN battle.dim_players dpl ON dpl.player_id = fpp.player_id
            WHERE fpp.battle_id = %s AND NOT dpl.is_bot
            """,
            (battle_id,),
        )

        for player in players:
            player_id = player["player_id"]
            username  = player["username"].lower()

            # Pokémon usados en esta batalla (el lineup de 6)
            used_rows = self.db.fetchall(
                """
                SELECT dp.species, fpp.pokemon_id, fpp.was_active
                FROM battle.fact_pokemon_performance fpp
                JOIN battle.dim_pokemon dp ON dp.pokemon_id = fpp.pokemon_id
                WHERE fpp.battle_id = %s AND fpp.player_id = %s
                """,
                (battle_id, player_id),
            )
            used_species = {r["species"].lower() for r in used_rows}

            # ── Sin roster registrado ──────────────────────────────────────────
            roster = self.db.fetchone(
                """
                SELECT r.roster_id, r.changes_used
                FROM tournament.roster r
                WHERE r.season_id = %s AND LOWER(r.username) = %s
                """,
                (season_id, username),
            )
            if not roster:
                cur.execute(
                    """
                    INSERT INTO tournament.team_violations
                        (battle_id, season_id, player_id, pokemon_id, violation_type, was_active)
                    SELECT %s, %s, %s, fpp.pokemon_id, 'no_roster_registered', fpp.was_active
                    FROM battle.fact_pokemon_performance fpp
                    WHERE fpp.battle_id = %s AND fpp.player_id = %s
                    ON CONFLICT (battle_id, player_id, pokemon_id) DO NOTHING
                    """,
                    (battle_id, season_id, player_id, battle_id, player_id),
                )
                continue

            roster_id    = roster["roster_id"]
            changes_used = roster["changes_used"]

            # Pool registrado de 8 pokémon
            pool_rows = self.db.fetchall(
                """
                SELECT LOWER(pc.name) AS species, pc.pokemon_id
                FROM tournament.roster_pokemon rp
                JOIN tournament.pokemon_cache pc ON pc.pokemon_id = rp.pokemon_id
                WHERE rp.roster_id = %s
                """,
                (roster_id,),
            )
            pool_species   = {r["species"] for r in pool_rows}
            pool_by_species = {r["species"]: r["pokemon_id"] for r in pool_rows}

            # ── 1. Pokémon fuera del pool ─────────────────────────────────────
            for u in used_rows:
                if u["species"].lower() not in pool_species:
                    cur.execute(
                        """
                        INSERT INTO tournament.team_violations
                            (battle_id, season_id, player_id, pokemon_id, roster_id, violation_type, was_active)
                        VALUES (%s, %s, %s, %s, %s, 'not_in_roster', %s)
                        ON CONFLICT (battle_id, player_id, pokemon_id) DO NOTHING
                        """,
                        (battle_id, season_id, player_id,
                         u["pokemon_id"], roster_id, u["was_active"]),
                    )

            # ── 2. Detección de rotación ──────────────────────────────────────
            # Lineup activo actual (set de 6 de la batalla anterior)
            lineup_rows = self.db.fetchall(
                """
                SELECT LOWER(pc.name) AS species
                FROM tournament.roster_lineup rl
                JOIN tournament.pokemon_cache pc ON pc.pokemon_id = rl.pokemon_id
                WHERE rl.roster_id = %s
                """,
                (roster_id,),
            )
            current_lineup = {r["species"] for r in lineup_rows}

            # Solo los pokémon del pool que usó en esta batalla
            valid_used = used_species & pool_species

            if not current_lineup:
                # Primera batalla → establece el lineup inicial (sin contar rotación)
                cur.execute(
                    "DELETE FROM tournament.roster_lineup WHERE roster_id = %s",
                    (roster_id,),
                )
                for sp in valid_used:
                    pid = pool_by_species.get(sp)
                    if pid:
                        cur.execute(
                            "INSERT INTO tournament.roster_lineup (roster_id, pokemon_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                            (roster_id, pid),
                        )

            elif valid_used != current_lineup:
                # Intento de rotación
                if changes_used >= max_changes:
                    # Sin cambios disponibles → violación
                    for u in used_rows:
                        if u["species"].lower() in pool_species:
                            cur.execute(
                                """
                                INSERT INTO tournament.team_violations
                                    (battle_id, season_id, player_id, pokemon_id, roster_id, violation_type, was_active)
                                VALUES (%s, %s, %s, %s, %s, 'rotation_exceeded', %s)
                                ON CONFLICT (battle_id, player_id, pokemon_id) DO NOTHING
                                """,
                                (battle_id, season_id, player_id,
                                 u["pokemon_id"], roster_id, u["was_active"]),
                            )
                else:
                    # Rotación válida → actualizar lineup y contar
                    cur.execute(
                        "DELETE FROM tournament.roster_lineup WHERE roster_id = %s",
                        (roster_id,),
                    )
                    for sp in valid_used:
                        pid = pool_by_species.get(sp)
                        if pid:
                            cur.execute(
                                "INSERT INTO tournament.roster_lineup (roster_id, pokemon_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                                (roster_id, pid),
                            )
                    cur.execute(
                        "UPDATE tournament.roster SET changes_used = changes_used + 1, updated_at = NOW() WHERE roster_id = %s",
                        (roster_id,),
                    )
                    # Historial de rotaciones: una fila por par (sale, entra). Todas las
                    # filas de una misma rotación comparten change_number.
                    removed = sorted(current_lineup - valid_used)
                    added   = sorted(valid_used - current_lineup)
                    for i in range(max(len(removed), len(added))):
                        cur.execute(
                            """
                            INSERT INTO tournament.roster_change_log
                                (roster_id, season_id, change_number, removed_pokemon_id,
                                 added_pokemon_id, changed_by, note)
                            VALUES (%s, %s, %s, %s, %s, 'etl', %s)
                            """,
                            (
                                roster_id, season_id, changes_used + 1,
                                pool_by_species.get(removed[i]) if i < len(removed) else None,
                                pool_by_species.get(added[i]) if i < len(added) else None,
                                battle_id,
                            ),
                        )

    # ─── Estadísticas ─────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        """Retorna estadísticas básicas del contenido actual de la DB."""
        row = self.db.fetchone("""
            SELECT
                (SELECT COUNT(*) FROM battle.fact_battles)              AS total_battles,
                (SELECT COUNT(*) FROM battle.dim_players)               AS total_players,
                (SELECT COUNT(*) FROM battle.dim_pokemon)               AS total_pokemon,
                (SELECT COUNT(*) FROM battle.etl_log WHERE status='ok') AS files_processed
        """)
        return row or {}


# =============================================================================
# Función pública: run_etl
# =============================================================================

def run_etl(
    logs_dir: Path,
    db: "BATSDatabase",
    verbose: bool = False,
    fmt: str | None = None,
) -> dict:
    """
    Ejecuta el pipeline ETL completo sobre un directorio de logs.

    Descubre archivos .log.json, los parsea y carga en la DB. Al finalizar,
    refresca todas las vistas materializadas de BATS.

    Args:
        logs_dir: Ruta al directorio raíz de logs de Pokémon Showdown.
        db:       Instancia de BATSDatabase con conexión activa.
        verbose:  Si True, loggea información detallada de cada archivo.
        fmt:      Filtrar por formato. None = todos los formatos.

    Returns:
        Diccionario con estadísticas: loaded, skipped, errors, total.
    """
    from bats_core.parser import find_log_files, parse_battle_file

    if verbose:
        logger.setLevel(logging.DEBUG)

    etl = BATSEtl(db)
    stats: dict = {"loaded": 0, "skipped": 0, "errors": 0, "total": 0, "error_details": []}

    logger.info("Iniciando ETL desde: %s", logs_dir.resolve())

    try:
        files = find_log_files(logs_dir, fmt)
    except FileNotFoundError as exc:
        logger.error("Directorio de logs no encontrado: %s", exc)
        raise

    stats["total"] = len(files)
    logger.info("Archivos encontrados: %d", stats["total"])

    for filepath in files:
        file_path_str = str(filepath.resolve())

        if etl._is_already_processed(file_path_str):
            stats["skipped"] += 1
            if verbose:
                logger.debug("Skip: %s", filepath.name)
            continue

        battle = parse_battle_file(filepath)
        if battle is None:
            stats["errors"] += 1
            stats["error_details"].append({"file": filepath.name, "reason": "parse error — archivo corrupto o incompleto"})
            _log_parse_error(db, file_path_str, filepath)
            continue

        try:
            loaded = etl.load_battle(battle, file_path_str)
            if loaded:
                stats["loaded"] += 1
                if verbose:
                    logger.debug(
                        "OK: %s (%d turnos, %s vs %s)",
                        battle.battle_id,
                        battle.turns,
                        battle.p1,
                        battle.p2,
                    )
            else:
                stats["skipped"] += 1
        except Exception as exc:
            logger.warning("Falló carga de '%s': %s", filepath.name, exc)
            stats["errors"] += 1
            stats["error_details"].append({"file": filepath.name, "reason": str(exc)})

    if stats["loaded"] > 0:
        logger.info("Refrescando vistas materializadas...")
        try:
            # v8: refresh sin bloquear lecturas. Si la base aún no tiene v8, cae al bloqueante.
            try:
                db.execute("SELECT battle.refresh_bats_views_concurrently()")
            except Exception:
                db.rollback()
                db.execute("SELECT battle.refresh_bats_views()")
            logger.info("Vistas refrescadas correctamente.")
        except Exception as exc:
            logger.warning("No se pudieron refrescar las vistas: %s", exc)

    logger.info(
        "ETL finalizado — Cargadas: %d | Skipped: %d | Errores: %d | Total: %d",
        stats["loaded"],
        stats["skipped"],
        stats["errors"],
        stats["total"],
    )
    return stats


def load_pushed(db: "BATSDatabase", battle: "BattleData") -> str:
    """
    Carga una batalla ya parseada que llegó por push (no hay archivo de origen).

    Idempotente por ``battle_id`` (clave sintética ``push:<battle_id>`` en
    battle.etl_log). NO refresca las vistas materializadas: eso lo hace un job
    aparte (battle.refresh_bats_views_concurrently), porque refrescarlas en cada
    batalla bloquea lecturas y excede el timeout serverless.

    Returns:
        'loaded'  — la batalla se cargó.
        'skipped' — ya estaba cargada, o es una batalla contra el bot.

    Raises:
        Exception: cualquier error de DB (el llamador decide el código HTTP).
    """
    loaded = BATSEtl(db).load_battle(battle, f"{PUSH_KEY_PREFIX}{battle.battle_id}")
    return "loaded" if loaded else "skipped"


def ingest_payload(
    db: "BATSDatabase",
    data: dict,
    battle_id: str,
    date: str,
    fmt: str,
) -> str:
    """
    Parsea y carga el contenido de un .log.json (sin leer ni escribir disco).

    Returns:
        'loaded' | 'skipped' (ver :func:`load_pushed`) o
        'ignored' — el log no es válido o es de prueba (< 3 turnos).
    """
    from bats_core.parser import parse_battle_dict

    battle = parse_battle_dict(data, battle_id, date, fmt, source=battle_id)
    if battle is None:
        return "ignored"
    return load_pushed(db, battle)


# =============================================================================
# Helpers internos
# =============================================================================

def _parse_date(date_str: str) -> date:
    """Convierte string 'YYYY-MM-DD' a date. Retorna hoy si el formato es inválido."""
    try:
        return date.fromisoformat(date_str)
    except (ValueError, TypeError):
        logger.warning("Fecha inválida '%s', usando fecha actual como fallback.", date_str)
        return date.today()


def _get_file_size(file_path: str) -> int | None:
    """Retorna el tamaño del archivo en bytes, o None si no es accesible."""
    try:
        return Path(file_path).stat().st_size
    except OSError:
        return None


def _log_error(
    db: "BATSDatabase",
    file_path: str,
    file_size: int | None,
    battle_id: str | None,
    exc: Exception,
) -> None:
    """Registra un error de carga en battle.etl_log en transacción independiente."""
    error_msg = f"{type(exc).__name__}: {exc}"
    try:
        db.conn.cursor().execute(
            """
            INSERT INTO battle.etl_log (file_path, file_size, battle_id, status, error_msg)
            VALUES (%s, %s, %s, 'error', %s)
            ON CONFLICT (file_path) DO UPDATE
                SET status       = 'error',
                    error_msg    = EXCLUDED.error_msg,
                    processed_at = NOW()
            """,
            (file_path, file_size, battle_id, error_msg[:2000]),
        )
        db.commit()
    except Exception as log_exc:
        logger.error("No se pudo registrar error en etl_log: %s", log_exc)
        try:
            db.rollback()
        except Exception:
            pass


def _log_parse_error(db: "BATSDatabase", file_path_str: str, filepath: Path) -> None:
    """Registra en battle.etl_log un archivo que el parser no pudo procesar."""
    file_size = _get_file_size(file_path_str)
    try:
        db.conn.cursor().execute(
            """
            INSERT INTO battle.etl_log (file_path, file_size, battle_id, status, error_msg)
            VALUES (%s, %s, NULL, 'error', 'Parser retornó None: archivo inválido o ignorado')
            ON CONFLICT (file_path) DO NOTHING
            """,
            (file_path_str, file_size),
        )
        db.commit()
    except Exception as exc:
        logger.debug("No se pudo registrar parse error para '%s': %s", filepath.name, exc)
        try:
            db.rollback()
        except Exception:
            pass
