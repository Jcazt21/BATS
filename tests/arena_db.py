"""
Guardia I13 para los tests de arena que usan base de datos: la suite se niega a correr si el DSN
de test es el de BATS_DB_DSN, apunta a Supabase o no parece una base de pruebas.
Espejo de motor/src/db/guard.ts.
"""
import os
import re


def assert_test_dsn(dsn: str | None, env: dict | None = None) -> str:
    env = os.environ if env is None else env
    if not dsn:
        raise RuntimeError("BATS_TEST_DSN no está definido.")
    if env.get("BATS_DB_DSN") and dsn == env["BATS_DB_DSN"]:
        raise RuntimeError("BATS_TEST_DSN es igual a BATS_DB_DSN: se niega a correr contra la base real.")
    if re.search("supabase", dsn, re.I):
        raise RuntimeError("BATS_TEST_DSN apunta a Supabase: se niega a correr contra producción.")
    if not re.search("test", dsn, re.I):
        raise RuntimeError('BATS_TEST_DSN debe contener "test" (base desechable).')
    return dsn
