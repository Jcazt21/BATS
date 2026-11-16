/**
 * Guardia I13: los tests de base de datos nunca tocan la base real. Se niega a seguir si el DSN
 * de test es el de `BATS_DB_DSN`, apunta a Supabase o no parece de pruebas.
 * Espejo de `tests/arena_db.py`.
 */
export function assertTestDsn(
  dsn: string | undefined,
  env: Record<string, string | undefined> = process.env,
): string {
  if (!dsn) throw new Error('BATS_TEST_DSN no está definido.');
  if (env.BATS_DB_DSN && dsn === env.BATS_DB_DSN) {
    throw new Error('BATS_TEST_DSN es igual a BATS_DB_DSN: se niega a correr contra la base real.');
  }
  if (/supabase/i.test(dsn)) {
    throw new Error('BATS_TEST_DSN apunta a Supabase: se niega a correr contra producción.');
  }
  if (!/test/i.test(dsn)) {
    throw new Error('BATS_TEST_DSN debe contener "test" (base desechable).');
  }
  return dsn;
}
