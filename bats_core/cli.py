"""
bats_core/cli.py
===========
Entry point del sistema BATS.

Subcomandos disponibles:
    (ninguno / modo legacy)  — Análisis en memoria con reporte CSV.
    db                       — Operaciones de base de datos PostgreSQL.
    ban                      — Gestión de bans del torneo.

Uso modo análisis (legacy):
    python -m bats_core --logs-dir ../pokemon-showdown/logs
    python -m bats_core --logs-dir ../pokemon-showdown/logs --format gen9ou --output mi_reporte.csv
    python -m bats_core --logs-dir ../pokemon-showdown/logs --ban-threshold 60 --verbose

Uso modo DB:
    python -m bats_core db --apply-schema
    python -m bats_core db --etl --logs-dir ../pokemon-showdown/logs
    python -m bats_core db --etl --logs-dir ../pokemon-showdown/logs --dsn postgresql://user:pw@host/bats
    python -m bats_core db --refresh-views
    python -m bats_core db --apply-schema --etl --logs-dir ../pokemon-showdown/logs

Uso modo ban:
    python -m bats_core ban --register --player "campixx21" --pokemon "Garchomp"
    python -m bats_core ban --register --player "campixx21" --pokemon "Garchomp"
    python -m bats_core ban --revoke --player "campixx21"
    python -m bats_core ban --list

Flags modo análisis:
    --logs-dir       (obligatorio) Ruta a la carpeta de logs de PS
    --format         Filtrar por formato (ej: gen9ou, gen9randombattle)
    --output         Nombre del CSV de salida (default: torneo_report.csv)
    --ban-threshold  Umbral de Pick Rate para candidatos a baneo (default: 70.0)
    --verbose        Activa logging DEBUG (útil para diagnosticar logs corruptos)

Flags modo DB:
    --apply-schema   Ejecuta schema.sql + migraciones v*.sql (idempotente)
    --etl            Corre el pipeline ETL completo
    --dsn            Connection string PostgreSQL (default: env BATS_DB_DSN)
    --refresh-views  Solo refresca las vistas materializadas
    --logs-dir       Ruta de logs (requerida con --etl)
    --format         Filtrar por formato en el ETL
    --verbose        Logging detallado

Flags modo ban:
    --register       Registra un nuevo ban
    --revoke         Revoca el ban activo de un jugador
    --list           Lista todos los bans activos
    --export-json    Exporta bans activos al active_bans.json compartido con PS
    --player         Username del jugador (requerido con --register y --revoke)
    --pokemon        Nombre del Pokémon a banear (requerido con --register)
    --dsn            Connection string PostgreSQL (default: env BATS_DB_DSN)
"""

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from .paths import ACTIVE_BANS_FILE, LOGS_DIR


from .parser import parse_battle_file, find_log_files
from .metrics import (
    build_raw_dataframe,
    compute_torneo_report,
    compute_pick_rate,
    compute_mvp_leaderboard,
    detect_outliers,
)
from .report import save_csv, print_full_report


# ─── Pipeline análisis en memoria ─────────────────────────────────────────────

def run_pipeline(
    logs_dir: Path,
    fmt: str | None,
    output: Path,
    ban_threshold: float,
) -> None:
    """Ejecuta el pipeline completo: parse → métricas → reporte."""

    # 1. Descubrir archivos
    print(f"\n[BATS] Buscando logs en: {logs_dir.resolve()}")
    try:
        files = find_log_files(logs_dir, fmt)
    except FileNotFoundError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)

    if not files:
        print(f"[ERROR] No se encontraron archivos .log.json "
              f"{'para el formato ' + fmt if fmt else ''}.", file=sys.stderr)
        sys.exit(1)

    print(f"[BATS] {len(files)} archivos encontrados. Procesando...")

    # 2. Parsear batallas
    battles = []
    skipped = 0

    for filepath in files:
        result = parse_battle_file(filepath)
        if result is None:
            # Diferenciar entre error y skip de batalla de prueba
            # (parse_battle_file ya loggea el detalle con --verbose)
            skipped += 1
        else:
            battles.append(result)

    valid   = len(battles)
    invalid = skipped

    print(f"[BATS] Válidas: {valid} | Ignoradas/Erróneas: {invalid}")

    if valid == 0:
        print("[ERROR] No hay batallas válidas para procesar.", file=sys.stderr)
        sys.exit(1)

    # 3. Construir DataFrame base
    df_raw = build_raw_dataframe(battles)
    total_battles = valid

    # 4. Calcular métricas
    print("[BATS] Calculando métricas BI...")
    report_df    = compute_torneo_report(df_raw, total_battles)
    pick_rate_df = compute_pick_rate(df_raw, total_battles)
    mvp_df       = compute_mvp_leaderboard(df_raw)
    outliers_df  = detect_outliers(pick_rate_df, ban_threshold)

    # 5. Imprimir resumen en consola
    print_full_report(report_df, pick_rate_df, mvp_df, outliers_df, total_battles)

    # 6. Guardar CSV final
    save_csv(report_df, output)


# ─── Subcomando: db ───────────────────────────────────────────────────────────

def run_db_command(args: argparse.Namespace) -> None:
    """
    Ejecuta las operaciones de base de datos según los flags provistos.

    Las operaciones se ejecutan en este orden si se combinan:
    1. --apply-schema
    2. --etl
    3. --refresh-views (implícito en --etl; explícito solo si se pide sin --etl)

    Los imports de psycopg2 y los módulos db son lazy: solo se cargan
    aquí, en tiempo de ejecución del subcomando. El CLI principal no
    requiere psycopg2 instalado para funcionar.

    Args:
        args: Namespace con los argumentos parseados del subcomando db.
    """
    # ── Import lazy de módulos de DB ─────────────────────────────────────────
    try:
        from .db.connection import BATSDatabase
    except ImportError as exc:
        print(
            f"[ERROR] No se puede importar el módulo de DB: {exc}\n"
            "        Instala las dependencias: pip install psycopg2-binary",
            file=sys.stderr,
        )
        sys.exit(1)

    if not any([args.apply_schema, args.etl, args.refresh_views]):
        print(
            "[ERROR] Especifica al menos una operación: --apply-schema, --etl o --refresh-views",
            file=sys.stderr,
        )
        sys.exit(1)

    dsn: str | None = args.dsn if args.dsn else None

    print("[BATS:db] Conectando a la base de datos...")
    try:
        with BATSDatabase(dsn=dsn) as db:

            # ── 1. Aplicar schema ────────────────────────────────────────────
            if args.apply_schema:
                schema_path = Path(__file__).parent / "db" / "schema.sql"
                print(f"[BATS:db] Aplicando schema: {schema_path}")
                try:
                    db.apply_schema(schema_path)
                    print("[BATS:db] Schema aplicado correctamente.")
                    applied = db.apply_migrations(schema_path.parent / "migrations")
                    print(f"[BATS:db] Migraciones aplicadas: {', '.join(applied) or 'ninguna'}.")
                    # Las vistas se crean WITH NO DATA y fallan al consultarse hasta poblarse.
                    db.execute("SELECT battle.refresh_bats_views_concurrently()")
                    print("[BATS:db] Vistas materializadas pobladas.")
                except FileNotFoundError as exc:
                    print(f"[ERROR] {exc}", file=sys.stderr)
                    sys.exit(1)
                except Exception as exc:
                    print(f"[ERROR] Error aplicando schema: {exc}", file=sys.stderr)
                    sys.exit(1)

            # ── 2. Ejecutar ETL ──────────────────────────────────────────────
            if args.etl:
                if not args.logs_dir:
                    print(
                        "[ERROR] --etl requiere --logs-dir para localizar los archivos de log.",
                        file=sys.stderr,
                    )
                    sys.exit(1)

                logs_dir: Path = args.logs_dir
                fmt: str | None = getattr(args, "format", None)

                print(f"[BATS:db] Iniciando ETL desde: {logs_dir.resolve()}")

                # Import lazy del pipeline ETL
                try:
                    from .db.etl import run_etl
                except ImportError as exc:
                    print(f"[ERROR] No se pudo importar el módulo ETL: {exc}", file=sys.stderr)
                    sys.exit(1)

                try:
                    stats = run_etl(
                        logs_dir=logs_dir,
                        db=db,
                        verbose=args.verbose,
                        fmt=fmt,
                    )
                except FileNotFoundError as exc:
                    print(f"[ERROR] {exc}", file=sys.stderr)
                    sys.exit(1)
                except Exception as exc:
                    print(f"[ERROR] ETL falló inesperadamente: {exc}", file=sys.stderr)
                    sys.exit(1)

                # Resumen de resultados
                print(
                    f"\n[BATS:db] ETL completado:\n"
                    f"  ✔ {stats['loaded']} batallas cargadas\n"
                    f"  ⊘ {stats['skipped']} skipped (ya procesadas)\n"
                    f"  ✖ {stats['errors']} errores\n"
                    f"  ─ {stats['total']} archivos en total"
                )

            # ── 3. Refrescar vistas (solo si se pidió explícitamente sin ETL) ─
            if args.refresh_views and not args.etl:
                print("[BATS:db] Refrescando vistas materializadas...")
                try:
                    db.execute("SELECT battle.refresh_bats_views()")
                    print("[BATS:db] Vistas refrescadas correctamente.")
                except Exception as exc:
                    print(f"[ERROR] No se pudieron refrescar las vistas: {exc}", file=sys.stderr)
                    sys.exit(1)

    except Exception as exc:
        print(f"[ERROR] Error de conexión a la base de datos: {exc}", file=sys.stderr)
        sys.exit(1)


# ─── Subcomando: ban ──────────────────────────────────────────────────────────

def run_ban_command(args: argparse.Namespace) -> None:
    """
    Ejecuta las operaciones de gestión de bans según los flags provistos.

    Operaciones disponibles (mutuamente excluyentes):
        --register      Registra un nuevo ban para un jugador.
        --revoke        Revoca el ban activo de un jugador.
        --list          Lista todos los bans activos del torneo.
        --export-json   Exporta bans activos al active_bans.json compartido con PS.

    Los imports de psycopg2 y los módulos de bans son lazy: solo se cargan
    en tiempo de ejecución del subcomando para no afectar el modo legacy.

    La tabla de --list usa rich si está disponible, o texto plano en caso
    contrario.

    Args:
        args: Namespace con los argumentos parseados del subcomando ban.
    """
    # ── Import lazy de módulos de DB y bans ───────────────────────────────────
    try:
        from .db.connection import BATSDatabase
    except ImportError as exc:
        print(
            f"[ERROR] No se puede importar el módulo de DB: {exc}\n"
            "        Instala las dependencias: pip install psycopg2-binary",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        from .bans import register_ban, revoke_ban, list_bans
        from .pokeapi import PokeAPIError
    except ImportError as exc:
        print(
            f"[ERROR] No se pudo importar el módulo de bans: {exc}",
            file=sys.stderr,
        )
        sys.exit(1)

    # ── Validar que se especificó exactamente una operación ───────────────────
    operations = [args.register, args.revoke, args.list, args.export_json]
    if sum(bool(op) for op in operations) == 0:
        print(
            "[ERROR] Especifica una operación: --register, --revoke, --list o --export-json",
            file=sys.stderr,
        )
        sys.exit(1)
    if sum(bool(op) for op in operations) > 1:
        print(
            "[ERROR] Solo puedes usar una operación a la vez: --register, --revoke, --list o --export-json",
            file=sys.stderr,
        )
        sys.exit(1)

    dsn: str | None = args.dsn if args.dsn else None

    # ── --list ────────────────────────────────────────────────────────────────
    if args.list:
        try:
            with BATSDatabase(dsn=dsn) as db:
                bans = list_bans(db)
        except Exception as exc:
            print(f"[ERROR] Error de conexión a la base de datos: {exc}", file=sys.stderr)
            sys.exit(1)

        _print_ban_table(bans)
        return

    # ── --export-json: exporta bans activos a JSON para PS ────────────────────
    if args.export_json:
        import json as _json
        output_path = Path(args.export_json) if args.export_json is not True else (
            ACTIVE_BANS_FILE
        )
        try:
            with BATSDatabase(dsn=dsn) as db:
                bans = list_bans(db)
        except Exception as exc:
            print(f"[ERROR] Error de conexión a la base de datos: {exc}", file=sys.stderr)
            sys.exit(1)

        # Extraer solo los nombres de Pokémon baneados para PS
        ban_names = [b["pokemon"] for b in bans]
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            _json.dumps(ban_names, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"[BATS:ban] {len(ban_names)} ban(es) exportado(s) → {output_path.resolve()}")
        for name in ban_names:
            print(f"  - {name}")
        return

    # ── --register y --revoke requieren --player ──────────────────────────────
    if not args.player:
        print(
            "[ERROR] --player es obligatorio con --register y --revoke.",
            file=sys.stderr,
        )
        sys.exit(1)

    # ── --register ────────────────────────────────────────────────────────────
    if args.register:
        if not args.pokemon:
            print(
                "[ERROR] --pokemon es obligatorio con --register.",
                file=sys.stderr,
            )
            sys.exit(1)

        print(f"[BATS:ban] Consultando PokéAPI para '{args.pokemon}'...")
        try:
            with BATSDatabase(dsn=dsn) as db:
                result = register_ban(
                    db,
                    player_username=args.player,
                    pokemon_name=args.pokemon,
                )
        except ValueError as exc:
            print(f"[ERROR] {exc}", file=sys.stderr)
            sys.exit(1)
        except PokeAPIError as exc:
            print(f"[ERROR] PokéAPI: {exc}", file=sys.stderr)
            sys.exit(1)
        except Exception as exc:
            print(f"[ERROR] Error inesperado: {exc}", file=sys.stderr)
            sys.exit(1)

        print(
            f"\n  Ban registrado:\n"
            f"  Jugador  : {result['player']}\n"
            f"  Pokémon  : {result['pokemon']}\n"
            f"  Tipos    : {result['types']}"
        )
        return

    # ── --revoke ──────────────────────────────────────────────────────────────
    if args.revoke:
        try:
            with BATSDatabase(dsn=dsn) as db:
                result = revoke_ban(db, player_username=args.player)
        except ValueError as exc:
            print(f"[ERROR] {exc}", file=sys.stderr)
            sys.exit(1)
        except Exception as exc:
            print(f"[ERROR] Error inesperado: {exc}", file=sys.stderr)
            sys.exit(1)

        print(
            f"\n  Ban revocado:\n"
            f"  Jugador  : {result['player']}\n"
            f"  Pokémon  : {result['pokemon']}\n"
            f"  Tipos    : {result['types']}\n"
            f"  Revocado : {result['revoked_at']}"
        )
        return


def run_clean_command(args: argparse.Namespace) -> None:
    """
    Elimina de la DB todas las batallas del formato indicado y sus registros
    relacionados: fact_pokemon_performance (CASCADE), etl_log, y opcionalmente
    el formato de dim_formats si quedó sin batallas.

    Luego refresca las vistas materializadas.
    """
    try:
        from .db.connection import BATSDatabase
    except ImportError as exc:
        print(
            f"[ERROR] No se puede importar el módulo de DB: {exc}\n"
            "        Instala las dependencias: pip install psycopg2-binary",
            file=sys.stderr,
        )
        sys.exit(1)

    fmt: str = args.format
    dsn: str | None = args.dsn or None

    print(f"\n[BATS:clean] Formato a limpiar: '{fmt}'")

    try:
        with BATSDatabase(dsn=dsn) as db:

            # ── 1. Contar cuántas batallas se van a borrar ────────────────────
            row = db.fetchone(
                """
                SELECT COUNT(*) AS total
                FROM battle.fact_battles fb
                JOIN battle.dim_formats df ON fb.format_id = df.format_id
                WHERE df.format_name = %s
                """,
                (fmt,),
            )
            total = int(row["total"]) if row else 0

            if total == 0:
                print(f"[BATS:clean] No hay batallas del formato '{fmt}' en la DB.")
                return

            print(f"[BATS:clean] Se eliminarán {total} batalla(s) y todos sus registros asociados.")

            if not args.yes:
                confirm = input("[BATS:clean] ¿Confirmar? (s/N): ").strip().lower()
                if confirm not in ("s", "si", "sí", "y", "yes"):
                    print("[BATS:clean] Cancelado.")
                    return

            # ── 2. Borrar etl_log de las batallas afectadas ───────────────────
            db.execute(
                """
                DELETE FROM battle.etl_log
                WHERE battle_id IN (
                    SELECT fb.battle_id
                    FROM battle.fact_battles fb
                    JOIN battle.dim_formats df ON fb.format_id = df.format_id
                    WHERE df.format_name = %s
                )
                """,
                (fmt,),
            )

            # ── 3. Borrar fact_battles (CASCADE elimina fact_pokemon_performance)
            db.execute(
                """
                DELETE FROM battle.fact_battles
                WHERE format_id = (
                    SELECT format_id FROM battle.dim_formats WHERE format_name = %s
                )
                """,
                (fmt,),
            )

            # ── 4. Borrar el formato de dim_formats si ya no tiene batallas ───
            db.execute(
                """
                DELETE FROM battle.dim_formats
                WHERE format_name = %s
                  AND NOT EXISTS (
                    SELECT 1 FROM battle.fact_battles fb
                    WHERE fb.format_id = (
                        SELECT format_id FROM battle.dim_formats df2
                        WHERE df2.format_name = %s
                    )
                  )
                """,
                (fmt, fmt),
            )

            # ── 5. Refrescar vistas ───────────────────────────────────────────
            print("[BATS:clean] Refrescando vistas materializadas...")
            db.execute("SELECT battle.refresh_bats_views()")

            print(f"[BATS:clean] Listo. {total} batalla(s) del formato '{fmt}' eliminadas.")

    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)


def run_reset_command(args: argparse.Namespace) -> None:
    """
    Reset total de la DB: borra TODA la data de batalla y torneo,
    reinicia las secuencias (RESTART IDENTITY) y refresca las vistas.

    Orden de borrado (respeta FKs):
      1. tournament.ban_votes, ban_participation, bans, seasons, ban_whitelist
      2. battle.etl_log
      3. battle.fact_battles  (CASCADE → fact_pokemon_performance)
      4. battle.dim_players, dim_formats, dim_pokemon
    """
    try:
        from .db.connection import BATSDatabase
    except ImportError as exc:
        print(
            f"[ERROR] No se puede importar el módulo de DB: {exc}\n"
            "        Instala las dependencias: pip install psycopg2-binary",
            file=sys.stderr,
        )
        sys.exit(1)

    dsn: str | None = args.dsn or None

    print("\n[BATS:reset] ⚠️  RESET TOTAL DE LA BASE DE DATOS ⚠️")
    print("[BATS:reset] Se eliminará TODO: batallas, jugadores, formatos,")
    print("[BATS:reset] Pokémon, temporadas, bans, votos y whitelist.")

    if not args.yes:
        confirm = input("\n[BATS:reset] Escribe RESET para confirmar: ").strip()
        if confirm != "RESET":
            print("[BATS:reset] Cancelado.")
            return

    try:
        with BATSDatabase(dsn=dsn) as db:

            # ── 1. tournament (orden: tablas hoja → tablas padre) ─────────────
            print("[BATS:reset] Limpiando esquema tournament...")
            db.execute("DELETE FROM tournament.ban_votes")
            db.execute("DELETE FROM tournament.ban_participation")
            db.execute("DELETE FROM tournament.bans")
            db.execute("DELETE FROM tournament.ban_whitelist")
            db.execute("DELETE FROM tournament.seasons")
            db.execute("DELETE FROM tournament.pokemon_cache")
            db.execute("ALTER SEQUENCE tournament.seasons_season_id_seq RESTART WITH 1")
            db.execute("ALTER SEQUENCE tournament.bans_ban_id_seq RESTART WITH 1")
            db.execute("ALTER SEQUENCE tournament.ban_votes_vote_id_seq RESTART WITH 1")
            db.execute("ALTER SEQUENCE tournament.pokemon_cache_pokemon_id_seq RESTART WITH 1")

            # ── 2. battle facts ───────────────────────────────────────────────
            print("[BATS:reset] Limpiando esquema battle (facts)...")
            db.execute("DELETE FROM battle.etl_log")
            db.execute("DELETE FROM battle.fact_battles")   # CASCADE → fact_pokemon_performance
            db.execute("ALTER SEQUENCE battle.etl_log_log_id_seq RESTART WITH 1")
            db.execute("ALTER SEQUENCE battle.fact_pokemon_performance_perf_id_seq RESTART WITH 1")

            # ── 3. battle dims ────────────────────────────────────────────────
            print("[BATS:reset] Limpiando esquema battle (dims)...")
            db.execute("DELETE FROM battle.dim_players")
            db.execute("DELETE FROM battle.dim_formats")
            db.execute("DELETE FROM battle.dim_pokemon")
            db.execute("ALTER SEQUENCE battle.dim_players_player_id_seq RESTART WITH 1")
            db.execute("ALTER SEQUENCE battle.dim_formats_format_id_seq RESTART WITH 1")
            db.execute("ALTER SEQUENCE battle.dim_pokemon_pokemon_id_seq RESTART WITH 1")

            # ── 4. Marcar archivos de log existentes como ya procesados ──────
            logs_dir: Path | None = args.logs_dir
            if logs_dir is not None:
                if not logs_dir.is_dir():
                    print(
                        f"[BATS:reset] Advertencia: --logs-dir '{logs_dir}' no existe, se omite.",
                        file=sys.stderr,
                    )
                else:
                    log_files = list(logs_dir.rglob("*.log"))
                    if log_files:
                        print(f"[BATS:reset] Marcando {len(log_files)} archivos de log como ya procesados...")
                        for lf in log_files:
                            try:
                                file_size = lf.stat().st_size
                            except OSError:
                                file_size = None
                            db.execute(
                                """
                                INSERT INTO battle.etl_log (file_path, file_size, battle_id, status)
                                VALUES (%s, %s, NULL, 'ok')
                                ON CONFLICT (file_path) DO NOTHING
                                """,
                                (str(lf.resolve()), file_size),
                            )
                        print(f"[BATS:reset] {len(log_files)} archivos marcados — el ETL los ignorará.")
                    else:
                        print("[BATS:reset] No se encontraron archivos .log en la carpeta indicada.")

            # ── 5. Refrescar vistas ───────────────────────────────────────────
            print("[BATS:reset] Refrescando vistas materializadas...")
            db.execute("SELECT battle.refresh_bats_views()")

            print("\n[BATS:reset] ✓ Reset completado. La DB está vacía.")
            if logs_dir is None:
                print("[BATS:reset] Tip: usa --logs-dir <ruta> para que el ETL ignore los logs viejos.")
            print("[BATS:reset] Tip: corre --apply-schema para reinsertar datos iniciales.")

    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)


def run_bot_command(args: argparse.Namespace) -> None:
    """
    Arranca el PGL-Bot: genera equipos válidos y acepta desafíos
    en el formato [Gen 9] PinchesGueys League indefinidamente.

    Args:
        args: Namespace con username, password, host, port.
    """
    try:
        from .bot.bot import main as bot_main
    except ImportError as exc:
        print(
            f"[ERROR] No se pudo importar el módulo del bot: {exc}\n"
            "        Instala las dependencias: pip install poke-env",
            file=sys.stderr,
        )
        sys.exit(1)

    bot_main(
        username=args.username,
        password=args.password or None,
        host=args.host,
        port=args.port,
    )


def run_backfill_command(args: argparse.Namespace) -> None:
    """Handler del subcomando `backfill`."""
    import os
    from .backfill import backfill

    url = args.url or os.environ.get("BATS_API_URL")
    token = args.token or os.environ.get("BATS_INGEST_TOKEN")
    if not url or (not token and not args.dry_run):
        print(
            "[ERROR] Faltan --url/BATS_API_URL y --token/BATS_INGEST_TOKEN.",
            file=sys.stderr,
        )
        sys.exit(1)
    try:
        stats = backfill(args.logs_dir, url, token or "", fmt=args.format, dry_run=args.dry_run)
    except FileNotFoundError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)

    print(
        f"[BATS:backfill] total={stats['total']} cargadas={stats['loaded']} "
        f"omitidas={stats['skipped']} ignoradas={stats['ignored']} fallidas={stats['failed']}"
    )
    if stats["failed"]:
        sys.exit(1)


def _print_ban_table(bans: list[dict]) -> None:
    """
    Imprime la lista de bans activos en formato de tabla.

    Usa rich si está disponible; si no, usa texto plano con bordes ASCII.

    Args:
        bans: Lista de dicts con claves banned_by_player, pokemon, types,
              banned_at (tal como los retorna list_bans / v_active_bans).
    """
    total = len(bans)

    if total == 0:
        print("\n  No hay bans activos en el torneo.")
        return

    # ── Intentar rich ─────────────────────────────────────────────────────────
    try:
        from rich.console import Console
        from rich.table import Table
        from rich import box as rich_box

        console = Console()
        table = Table(
            box=rich_box.DOUBLE_EDGE,
            header_style="bold magenta",
            show_lines=False,
        )
        table.add_column("Jugador",    style="cyan",  no_wrap=True)
        table.add_column("Pokémon",    style="green", no_wrap=True)
        table.add_column("Tipos",      style="yellow")
        table.add_column("Baneado el", style="white")

        for ban in bans:
            banned_at = ban.get("banned_at", "")
            if hasattr(banned_at, "strftime"):
                banned_at = banned_at.strftime("%Y-%m-%d %H:%M:%S")
            else:
                banned_at = str(banned_at)

            table.add_row(
                ban.get("banned_by_player", ""),
                ban.get("pokemon", ""),
                ban.get("types", "") or "",
                banned_at,
            )

        console.print(table)
        print(f"Total: {total} ban{'es' if total != 1 else ''} activo{'s' if total != 1 else ''}")
        return

    except ImportError:
        pass

    # ── Fallback: texto plano con bordes ─────────────────────────────────────
    # Calcular anchos de columna
    col_player  = max(len("Jugador"),  max(len(b.get("banned_by_player", "")) for b in bans))
    col_pokemon = max(len("Pokémon"),  max(len(b.get("pokemon", ""))          for b in bans))
    col_types   = max(len("Tipos"),    max(len(b.get("types", "") or "")       for b in bans))
    col_date    = max(len("Baneado el"), 19)  # "YYYY-MM-DD HH:MM:SS" = 19 chars

    def _hr(left: str, mid: str, fill: str, right: str) -> str:
        return (
            left
            + fill * (col_player  + 2) + mid
            + fill * (col_pokemon + 2) + mid
            + fill * (col_types   + 2) + mid
            + fill * (col_date    + 2)
            + right
        )

    def _row(player: str, pokemon: str, types: str, date: str) -> str:
        return (
            f"  {player:<{col_player}}  "
            f"  {pokemon:<{col_pokemon}}  "
            f"  {types:<{col_types}}  "
            f"  {date:<{col_date}}  "
        )

    print()
    print(_hr("╔", "╦", "═", "╗"))
    print(
        "║"
        + f" {'Jugador':<{col_player}} " + " ║"
        + f" {'Pokémon':<{col_pokemon}} " + " ║"
        + f" {'Tipos':<{col_types}} " + " ║"
        + f" {'Baneado el':<{col_date}} " + " ║"
    )
    print(_hr("╠", "╬", "═", "╣"))

    for ban in bans:
        banned_at = ban.get("banned_at", "")
        if hasattr(banned_at, "strftime"):
            banned_at = banned_at.strftime("%Y-%m-%d %H:%M:%S")
        else:
            banned_at = str(banned_at)[:19]

        print(
            "║"
            + f" {ban.get('banned_by_player', ''):<{col_player}} " + " ║"
            + f" {ban.get('pokemon', ''):<{col_pokemon}} " + " ║"
            + f" {(ban.get('types') or ''):<{col_types}} " + " ║"
            + f" {banned_at:<{col_date}} " + " ║"
        )

    print(_hr("╚", "╩", "═", "╝"))
    print(f"Total: {total} ban{'es' if total != 1 else ''} activo{'s' if total != 1 else ''}")


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    """
    Punto de entrada principal del CLI de BATS.

    Detecta si el primer argumento es el subcomando 'db' y lo despacha
    al handler correspondiente. En caso contrario, usa el modo de análisis
    en memoria (comportamiento original).
    """
    # ── Parser raíz ──────────────────────────────────────────────────────────
    root_parser = argparse.ArgumentParser(
        prog="bats_core",
        description="BATS — Battle Analyzing and Tracking System para Pokémon Showdown",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Subcomandos:
  db                  Operaciones de base de datos PostgreSQL
  ban                 Gestión de bans del torneo
  reset               Reset TOTAL de la DB (borra todo)
  clean               Elimina batallas de un formato de la DB
  bot                 Arranca el PGL-Bot para practicar

Ejemplos (análisis en memoria):
  python -m bats_core --logs-dir logs/
  python -m bats_core --logs-dir logs/ --format gen9ou
  python -m bats_core --logs-dir logs/ --output torneo_mayo.csv --ban-threshold 60

Ejemplos (base de datos):
  python -m bats_core db --apply-schema
  python -m bats_core db --etl --logs-dir logs/
  python -m bats_core db --apply-schema --etl --logs-dir logs/ --verbose
  python -m bats_core db --refresh-views

Ejemplos (bans):
  python -m bats_core ban --register --player "campixx21" --pokemon "Garchomp"
  python -m bats_core ban --register --player "campixx21" --pokemon "Garchomp"
  python -m bats_core ban --revoke --player "campixx21"
  python -m bats_core ban --list
        """,
        add_help=True,
    )

    subparsers = root_parser.add_subparsers(dest="subcommand")

    # ── Subcomando: db ────────────────────────────────────────────────────────
    db_parser = subparsers.add_parser(
        "db",
        help="Operaciones de base de datos PostgreSQL (schema, ETL, vistas).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python -m bats_core db --apply-schema
  python -m bats_core db --etl --logs-dir logs/
  python -m bats_core db --etl --logs-dir logs/ --format gen9ou --dsn postgresql://localhost/bats
  python -m bats_core db --apply-schema --etl --logs-dir logs/ --verbose
  python -m bats_core db --refresh-views
        """,
    )
    db_parser.add_argument(
        "--apply-schema",
        action="store_true",
        default=False,
        help="Ejecuta schema.sql y las migraciones db/migrations/v*.sql (idempotente).",
    )
    db_parser.add_argument(
        "--etl",
        action="store_true",
        default=False,
        help="Corre el pipeline ETL completo (requiere --logs-dir).",
    )
    db_parser.add_argument(
        "--refresh-views",
        action="store_true",
        default=False,
        help="Refresca las vistas materializadas de BATS (mv_pick_rate, etc.).",
    )
    db_parser.add_argument(
        "--dsn",
        type=str,
        default=None,
        metavar="DSN",
        help=(
            "Connection string PostgreSQL "
            "(ej: postgresql://user:pw@host:5432/bats). "
            "Si no se especifica, se lee de la variable de entorno BATS_DB_DSN. "
            "Fallback: postgresql://localhost/bats"
        ),
    )
    db_parser.add_argument(
        "--logs-dir",
        type=Path,
        default=None,
        metavar="DIR",
        help="Carpeta raíz de logs de Pokémon Showdown. Requerido con --etl.",
    )
    db_parser.add_argument(
        "--format",
        type=str,
        default=None,
        metavar="FORMAT",
        help="Filtrar ETL por formato (ej: gen9ou, gen9randombattle).",
    )
    db_parser.add_argument(
        "--verbose",
        action="store_true",
        help="Activar logging detallado (DEBUG).",
    )

    # ── Subcomando: ban ───────────────────────────────────────────────────────
    subparsers.add_parser(
        "api",
        help="Arrancar el servidor API de BATS (lee host/port del .env)",
    )

    reset_parser = subparsers.add_parser(
        "reset",
        help="Reset TOTAL de la DB: borra toda la data y reinicia secuencias.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python -m bats_core reset                                    # pide confirmación escribiendo RESET
  python -m bats_core reset --yes                              # sin confirmación
  python -m bats_core reset --yes --logs-dir logs/             # marca logs viejos para que el ETL los ignore
  python -m bats_core reset --yes --logs-dir logs/ --dsn postgresql://localhost/bats
        """,
    )
    reset_parser.add_argument(
        "--yes", "-y",
        action="store_true",
        default=False,
        help="Confirmar automáticamente sin pedir input.",
    )
    reset_parser.add_argument(
        "--logs-dir",
        type=Path,
        default=None,
        metavar="DIR",
        help=(
            "Carpeta de logs existentes. Si se especifica, todos los archivos .log "
            "encontrados se marcan como ya procesados para que el ETL no los re-importe."
        ),
    )
    reset_parser.add_argument(
        "--dsn",
        type=str,
        default=None,
        metavar="DSN",
        help="Connection string PostgreSQL. Default: env BATS_DB_DSN.",
    )

    clean_parser = subparsers.add_parser(
        "clean",
        help="Elimina batallas de un formato específico de la DB.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python -m bats_core clean                                  # borra gen9randombattle (default)
  python -m bats_core clean --format gen9randombattle
  python -m bats_core clean --format gen9randombattle --yes  # sin confirmación
  python -m bats_core clean --format gen9ou --dsn postgresql://localhost/bats
        """,
    )
    clean_parser.add_argument(
        "--format",
        type=str,
        default="gen9randombattle",
        metavar="FORMAT",
        help="ID del formato a limpiar (default: gen9randombattle).",
    )
    clean_parser.add_argument(
        "--yes", "-y",
        action="store_true",
        default=False,
        help="Confirmar automáticamente sin pedir input.",
    )
    clean_parser.add_argument(
        "--dsn",
        type=str,
        default=None,
        metavar="DSN",
        help="Connection string PostgreSQL. Default: env BATS_DB_DSN.",
    )

    bot_parser = subparsers.add_parser(
        "bot",
        help="Arranca el PGL-Bot para practicar en [Gen 9] PinchesGueys League.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python -m bats_core bot
  python -m bats_core bot --username MiBot
  python -m bats_core bot --username PGL-Bot --host localhost --port 8000

Una vez corriendo, desafialo desde PS con:
  /challenge PGL-Bot, [Gen 9] PinchesGueys League
        """,
    )
    bot_parser.add_argument(
        "--username",
        type=str,
        default="PGL-Bot",
        metavar="USERNAME",
        help="Nombre del bot en el servidor PS (default: PGL-Bot).",
    )
    bot_parser.add_argument(
        "--password",
        type=str,
        default=None,
        metavar="PASSWORD",
        help="Contraseña del bot. Omitir para servidor local sin auth.",
    )
    bot_parser.add_argument(
        "--host",
        type=str,
        default="localhost",
        metavar="HOST",
        help="Host del servidor PS (default: localhost).",
    )
    bot_parser.add_argument(
        "--port",
        type=int,
        default=8000,
        metavar="PORT",
        help="Puerto del servidor PS (default: 8000).",
    )

    backfill_parser = subparsers.add_parser(
        "backfill",
        help="Reenvía los .log.json de disco a la API (POST /api/ingest/battle). Idempotente.",
    )
    backfill_parser.add_argument(
        "--logs-dir", type=Path, default=LOGS_DIR, metavar="DIR",
        help="Carpeta raíz de logs de PS (default: ../pokemon-showdown/logs).",
    )
    backfill_parser.add_argument(
        "--url", type=str, default=None, metavar="URL",
        help="URL base de la API de BATS. Default: env BATS_API_URL.",
    )
    backfill_parser.add_argument(
        "--token", type=str, default=None, metavar="TOKEN",
        help="Token de ingesta. Default: env BATS_INGEST_TOKEN (preferible a pasarlo por argumento).",
    )
    backfill_parser.add_argument("--format", type=str, default=None, help="Enviar solo este formato.")
    backfill_parser.add_argument("--dry-run", action="store_true", help="Lista lo que enviaría, sin enviar.")

    dex_parser = subparsers.add_parser(
        "dex",
        help="Importa el snapshot del dex de Showdown (tools/export_dex.js) a la base.",
    )
    dex_parser.add_argument("--import", dest="do_import", action="store_true",
                            help="Importa species.json y meta.json a tournament.dex_species.")
    dex_parser.add_argument("--dir", default=str(Path(__file__).parent.parent / "web" / "public" / "dex"),
                            help="Carpeta del snapshot (por defecto web/public/dex).")
    dex_parser.add_argument("--dsn", default=None, help="DSN alternativo (por defecto BATS_DB_DSN).")

    ban_parser = subparsers.add_parser(
        "ban",
        help="Gestión de bans del torneo (registrar, revocar, listar).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python -m bats_core ban --register --player "campixx21" --pokemon "Garchomp"
  python -m bats_core ban --register --player "campixx21" --pokemon "Garchomp"
  python -m bats_core ban --revoke --player "campixx21"
  python -m bats_core ban --list
  python -m bats_core ban --list --dsn postgresql://user:pw@host/bats
        """,
    )
    ban_op_group = ban_parser.add_mutually_exclusive_group(required=True)
    ban_op_group.add_argument(
        "--register",
        action="store_true",
        default=False,
        help="Registra un nuevo ban para el jugador especificado con --player.",
    )
    ban_op_group.add_argument(
        "--revoke",
        action="store_true",
        default=False,
        help="Revoca el ban activo del jugador especificado con --player.",
    )
    ban_op_group.add_argument(
        "--list",
        action="store_true",
        default=False,
        help="Lista todos los bans activos del torneo.",
    )
    ban_op_group.add_argument(
        "--export-json",
        dest="export_json",
        nargs="?",
        const=True,
        default=False,
        metavar="FILE",
        help=(
            "Exporta los bans activos a un archivo JSON legible por Pokémon Showdown. "
            "Si no se especifica FILE, usa <PS_DIR>/active_bans.json por defecto."
        ),
    )
    ban_parser.add_argument(
        "--player",
        type=str,
        default=None,
        metavar="USERNAME",
        help="Username del jugador. Requerido con --register y --revoke.",
    )
    ban_parser.add_argument(
        "--pokemon",
        type=str,
        default=None,
        metavar="POKEMON",
        help=(
            "Nombre del Pokémon a banear. Requerido con --register. "
            "Acepta cualquier capitalización (ej: 'Garchomp', 'flutter mane')."
        ),
    )
    ban_parser.add_argument(
        "--dsn",
        type=str,
        default=None,
        metavar="DSN",
        help=(
            "Connection string PostgreSQL "
            "(ej: postgresql://user:pw@host:5432/bats). "
            "Si no se especifica, se lee de la variable de entorno BATS_DB_DSN. "
            "Fallback: postgresql://localhost/bats"
        ),
    )

    # ── Argumentos modo análisis (modo legacy, sin subcomando) ────────────────
    root_parser.add_argument(
        "--logs-dir",
        type=Path,
        metavar="DIR",
        help="Carpeta raíz de logs de Pokémon Showdown (ej: ./logs)",
    )
    root_parser.add_argument(
        "--format",
        type=str,
        default=None,
        metavar="FORMAT",
        help="Filtrar por formato (ej: gen9ou, gen9randombattle)",
    )
    root_parser.add_argument(
        "--output",
        type=Path,
        default=Path("torneo_report.csv"),
        metavar="FILE",
        help="Ruta del CSV de salida (default: torneo_report.csv)",
    )
    root_parser.add_argument(
        "--ban-threshold",
        type=float,
        default=70.0,
        metavar="PCT",
        help="Pick Rate %% para candidatos a baneo (default: 70.0)",
    )
    root_parser.add_argument(
        "--verbose",
        action="store_true",
        help="Activar logging detallado (DEBUG)",
    )

    args = root_parser.parse_args()

    # ── Configurar logging ────────────────────────────────────────────────────
    verbose = getattr(args, "verbose", False)
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.WARNING,
        format="%(levelname)s [%(name)s]: %(message)s",
        stream=sys.stderr,
    )

    # ── Despacho de subcomandos ───────────────────────────────────────────────
    if args.subcommand == "db":
        run_db_command(args)
        return

    if args.subcommand == "ban":
        run_ban_command(args)
        return

    if args.subcommand == "api":
        from .api.main import serve
        serve()
        return

    if args.subcommand == "backfill":
        run_backfill_command(args)
        return

    if args.subcommand == "reset":
        run_reset_command(args)
        return

    if args.subcommand == "clean":
        run_clean_command(args)
        return

    if args.subcommand == "dex":
        if not args.do_import:
            dex_parser.error("Usa --import.")
        from . import dex as dex_module
        from .db.connection import BATSDatabase
        with BATSDatabase(args.dsn) as db:
            result = dex_module.import_snapshot(db, args.dir)
        print(f"Dex importado: {result['species']} especies (PS {result['ps_commit']}).")
        return

    if args.subcommand == "bot":
        run_bot_command(args)
        return

    # ── Modo legacy: análisis en memoria ─────────────────────────────────────
    if args.logs_dir is None:
        root_parser.print_help()
        print(
            "\n[ERROR] --logs-dir es obligatorio en modo análisis.",
            file=sys.stderr,
        )
        sys.exit(1)

    run_pipeline(
        logs_dir=args.logs_dir,
        fmt=args.format,
        output=args.output,
        ban_threshold=args.ban_threshold,
    )


if __name__ == "__main__":
    main()
