"""
bats_core/db/connection.py
=====================
Gestión de conexión a PostgreSQL para el sistema BATS.

Provee la clase BATSDatabase como context manager y API de acceso
a la base de datos, usando psycopg2 con RealDictCursor para
resultados como diccionarios de Python.

Variables de entorno:
    BATS_DB_DSN  — Connection string completo (ej: postgresql://user:pw@host/bats).
                   Si no está definida, se usa "postgresql://localhost/bats".

Uso::

    from bats_core.db.connection import BATSDatabase

    # Como context manager (recomendado)
    with BATSDatabase() as db:
        db.execute("INSERT INTO dim_players(username) VALUES (%s)", ("ash",))
        rows = db.fetchall("SELECT * FROM dim_players")

    # DSN explícito
    db = BATSDatabase(dsn="postgresql://user:pass@host:5432/bats")
    db.connect()
    ...
    db.disconnect()
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Segundos para abrir la conexión antes de rendirse. En serverless conviene fallar
# rápido en vez de agotar el timeout de la función. Sobreescribible por env.
_DEFAULT_CONNECT_TIMEOUT = 10


class BATSDatabase:
    """
    Wrapper de conexión a PostgreSQL para BATS.

    Gestiona el ciclo de vida de la conexión (connect/disconnect),
    expone métodos de ejecución de consultas y soporta uso como
    context manager (with BATSDatabase() as db: ...).

    Attributes:
        dsn: Connection string de PostgreSQL.
    """

    def __init__(self, dsn: Optional[str] = None) -> None:
        """
        Inicializa la instancia con el DSN de conexión.

        La precedencia de configuración es:
        1. Argumento ``dsn`` pasado explícitamente.
        2. Variable de entorno ``BATS_DB_DSN``.

        No hay DSN por defecto: si falta, ``connect()`` falla con un error claro
        en vez de intentar conectarse a un localhost que en un despliegue
        (Vercel) no existe.

        Args:
            dsn: Connection string de PostgreSQL. Si es None, se lee
                 de la variable de entorno BATS_DB_DSN.
        """
        self.dsn: Optional[str] = dsn or os.environ.get("BATS_DB_DSN")
        self._conn: Any = None  # psycopg2.connection (tipado como Any para evitar import en nivel módulo)

    # ─── Propiedades ──────────────────────────────────────────────────────────

    @property
    def conn(self) -> Any:
        """
        Objeto de conexión psycopg2 subyacente.

        Returns:
            La conexión activa de psycopg2.

        Raises:
            RuntimeError: Si no hay conexión activa.
        """
        if self._conn is None:
            raise RuntimeError(
                "No hay conexión activa. Llama a connect() o usa el context manager."
            )
        return self._conn

    # ─── Ciclo de vida ────────────────────────────────────────────────────────

    def connect(self) -> None:
        """
        Abre la conexión a PostgreSQL.

        Usa psycopg2 con autocommit desactivado (control manual de transacciones).
        Activa la extensión pg_trgm si está disponible (útil para búsquedas futuras).

        Raises:
            psycopg2.OperationalError: Si la conexión falla.
        """
        import psycopg2  # Import lazy: solo cuando realmente se necesita

        if not self.dsn:
            raise RuntimeError(
                "BATS_DB_DSN no está configurado. Define la variable de entorno "
                "(en local: bats/.env; en Vercel: Project Settings → Environment Variables)."
            )

        logger.info("Conectando a PostgreSQL: %s", self._redacted_dsn())
        timeout = int(os.environ.get("BATS_DB_CONNECT_TIMEOUT", _DEFAULT_CONNECT_TIMEOUT))
        self._conn = psycopg2.connect(self.dsn, connect_timeout=timeout)
        self._conn.autocommit = False
        logger.debug("Conexión establecida.")

    def disconnect(self) -> None:
        """
        Cierra la conexión a PostgreSQL si está abierta.

        No lanza excepción si la conexión ya estaba cerrada.
        """
        if self._conn is not None:
            try:
                self._conn.close()
                logger.info("Conexión a PostgreSQL cerrada.")
            except Exception as exc:
                logger.warning("Error al cerrar conexión: %s", exc)
            finally:
                self._conn = None

    # ─── Context manager ──────────────────────────────────────────────────────

    def __enter__(self) -> "BATSDatabase":
        """Abre la conexión al entrar al bloque with."""
        self.connect()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """
        Cierra la conexión al salir del bloque with.

        Hace commit si no hubo excepción; rollback si la hubo.
        Esto garantiza que fetchone() con UPDATE/INSERT...RETURNING
        también persista sin necesidad de llamar commit() manualmente.
        """
        if self._conn is not None:
            if exc_type is not None:
                try:
                    self._conn.rollback()
                    logger.warning("Rollback ejecutado por excepción: %s", exc_val)
                except Exception:
                    pass
            else:
                try:
                    self._conn.commit()
                except Exception as exc:
                    logger.error("Error en commit al salir del context manager: %s", exc)
        self.disconnect()

    # ─── Métodos de consulta ──────────────────────────────────────────────────

    def execute(self, sql: str, params: Optional[tuple] = None) -> None:
        """
        Ejecuta una sentencia SQL y hace commit.

        Usa un cursor estándar (sin retorno de filas). Para INSERT, UPDATE,
        DELETE o DDL. Hace commit automático al finalizar.

        Args:
            sql:    Sentencia SQL a ejecutar. Usar %s como placeholders.
            params: Tupla de parámetros para la sentencia. None si no aplica.

        Raises:
            psycopg2.Error: Si la ejecución falla. En ese caso hace rollback.
        """
        try:
            with self.conn.cursor() as cur:
                cur.execute(sql, params)
            self.conn.commit()
        except Exception as exc:
            self.conn.rollback()
            logger.error("Error ejecutando SQL: %s | params: %s | error: %s", sql[:120], params, exc)
            raise

    def fetchall(self, sql: str, params: Optional[tuple] = None) -> list[dict]:
        """
        Ejecuta una consulta SELECT y retorna todas las filas como lista de dicts.

        Usa RealDictCursor para acceso por nombre de columna.

        Args:
            sql:    Consulta SQL a ejecutar.
            params: Tupla de parámetros. None si no aplica.

        Returns:
            Lista de diccionarios, uno por fila. Lista vacía si no hay resultados.

        Raises:
            psycopg2.Error: Si la consulta falla.
        """
        import psycopg2.extras  # Import lazy

        try:
            with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
            # Convertir de RealDictRow a dict plano para evitar dependencias de psycopg2 en el caller
            return [dict(row) for row in rows]
        except Exception as exc:
            logger.error("Error en fetchall: %s | params: %s | error: %s", sql[:120], params, exc)
            raise

    def fetchone(self, sql: str, params: Optional[tuple] = None) -> Optional[dict]:
        """
        Ejecuta una consulta y retorna una única fila como dict, o None si no hay resultados.

        Args:
            sql:    Consulta SQL a ejecutar.
            params: Tupla de parámetros. None si no aplica.

        Returns:
            Diccionario con la primera fila, o None si el resultado está vacío.

        Raises:
            psycopg2.Error: Si la consulta falla.
        """
        import psycopg2.extras  # Import lazy

        try:
            with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                row = cur.fetchone()
            return dict(row) if row is not None else None
        except Exception as exc:
            logger.error("Error en fetchone: %s | params: %s | error: %s", sql[:120], params, exc)
            raise

    # ─── Gestión de esquema ───────────────────────────────────────────────────

    def apply_schema(self, schema_path: Path) -> None:
        """
        Lee y ejecuta el archivo schema.sql contra la base de datos.

        Ejecuta el DDL completo en una única sentencia (psycopg2 soporta
        múltiples statements en execute si se usa el driver directamente).
        Ideal para inicializar o actualizar el esquema de manera idempotente
        (el schema usa IF NOT EXISTS en todos los objetos).

        Args:
            schema_path: Ruta al archivo schema.sql.

        Raises:
            FileNotFoundError: Si el archivo no existe.
            psycopg2.Error:    Si alguna sentencia DDL falla.
        """
        if not schema_path.exists():
            raise FileNotFoundError(f"Schema no encontrado: {schema_path}")

        logger.info("Aplicando schema desde: %s", schema_path)
        sql = schema_path.read_text(encoding="utf-8")

        try:
            with self.conn.cursor() as cur:
                cur.execute(sql)
            self.conn.commit()
            logger.info("Schema aplicado correctamente.")
        except Exception as exc:
            self.conn.rollback()
            logger.error("Error aplicando schema: %s", exc)
            raise

    def apply_migrations(self, migrations_dir: Path) -> list[str]:
        """
        Aplica en orden numérico las migraciones ``v<N>.sql`` de un directorio.

        Todas las migraciones de BATS son idempotentes (IF NOT EXISTS / OR
        REPLACE), así que reaplicarlas sobre una base ya migrada es seguro.
        Cada archivo corre en su propia transacción; si uno falla se hace
        rollback de ese archivo y se aborta (los anteriores quedan aplicados).

        Args:
            migrations_dir: Carpeta con los archivos v2.sql, v3.sql, ...

        Returns:
            Nombres de los archivos aplicados, en orden.
        """
        import re

        def _version(path: Path) -> int:
            m = re.fullmatch(r"v(\d+)\.sql", path.name)
            return int(m.group(1)) if m else -1

        files = sorted((f for f in migrations_dir.glob("v*.sql") if _version(f) >= 0), key=_version)
        applied: list[str] = []
        for f in files:
            logger.info("Aplicando migración: %s", f.name)
            try:
                with self.conn.cursor() as cur:
                    cur.execute(f.read_text(encoding="utf-8"))
                self.conn.commit()
            except Exception as exc:
                self.conn.rollback()
                logger.error("Error aplicando migración %s: %s", f.name, exc)
                raise
            applied.append(f.name)
        return applied

    # ─── Transacciones manuales ───────────────────────────────────────────────

    def begin(self) -> None:
        """
        Marca el inicio de una transacción explícita.

        En psycopg2 con autocommit=False las transacciones se inician
        automáticamente, pero este método es útil para claridad en el código ETL.
        """
        logger.debug("Iniciando transacción explícita.")

    def commit(self) -> None:
        """Confirma la transacción actual."""
        self.conn.commit()
        logger.debug("Transacción committed.")

    def rollback(self) -> None:
        """Revierte la transacción actual."""
        self.conn.rollback()
        logger.debug("Transacción rolled back.")

    # ─── Helpers internos ─────────────────────────────────────────────────────

    def _redacted_dsn(self) -> str:
        """
        Retorna el DSN con la contraseña censurada para logging seguro.

        Ejemplo: postgresql://user:***@host:5432/bats
        """
        import re
        return re.sub(r"(:)[^:@]+(@)", r"\1***\2", self.dsn)
