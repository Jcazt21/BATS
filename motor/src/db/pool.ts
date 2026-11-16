import { attachDatabasePool } from '@vercel/functions';
import pg from 'pg';

/** Serverless: pocas conexiones por instancia (el pooler de Supabase corre en modo transacción). */
export const MAX_CONEXIONES = 3;

/**
 * Pool con la configuración del motor. Sin sentencias preparadas con nombre (el pooler en modo
 * transacción no las soporta): nunca pasar `name` en una consulta.
 */
export function crearPool(dsn: string, max = MAX_CONEXIONES): pg.Pool {
  return new pg.Pool({
    connectionString: dsn,
    max,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
  });
}

let pool: pg.Pool | null = null;

/** Singleton de módulo: sobrevive entre invocaciones calientes (Fluid compute). */
export function getPool(): pg.Pool {
  if (!pool) {
    const dsn = process.env.BATS_DB_DSN;
    if (!dsn) throw new Error('BATS_DB_DSN no está configurado.');
    pool = crearPool(dsn);
    attachDatabasePool(pool);
  }
  return pool;
}

export async function cerrarPool(): Promise<void> {
  const actual = pool;
  pool = null;
  await actual?.end();
}
