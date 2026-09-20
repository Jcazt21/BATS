"""
bats_core/db
=======
Capa de persistencia del sistema BATS (Battle Analyzing and Tracking System).

Submodulos:
    connection  — Clase BATSDatabase: gestión de conexión a PostgreSQL.
    etl         — Pipeline ETL: carga de BattleData desde parser hacia la DB.
    schema.sql  — DDL completo: tablas, índices, vistas materializadas y funciones.

Uso típico::

    from bats_core.db.connection import BATSDatabase
    from bats_core.db.etl import run_etl
    from pathlib import Path

    with BATSDatabase() as db:
        db.apply_schema(Path(__file__).parent / "schema.sql")
        stats = run_etl(Path("logs/"), db, verbose=True)
        print(stats)
"""
