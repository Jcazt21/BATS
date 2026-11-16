import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import { assertTestDsn } from '../../src/db/guard.js';
import { crearPool } from '../../src/db/pool.js';
import type { Dorada } from './doradas.js';

/** DSN de la base desechable, o `null` si no hay (los tests de DB se saltan). Pasa la guardia I13. */
export function dsnDeTest(): string | null {
  const dsn = process.env.BATS_TEST_DSN;
  if (!dsn) {
    // En CI (job `integracion`) saltarse los tests en silencio sería un falso verde.
    if (process.env.MOTOR_DB_OBLIGATORIA) throw new Error('BATS_TEST_DSN es obligatorio en este entorno.');
    return null;
  }
  return assertTestDsn(dsn);
}

export const hayDb = dsnDeTest() !== null;

export function poolDeTest(max = 6): pg.Pool {
  return crearPool(dsnDeTest()!, max);
}

export async function crearTemporada(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO tournament.seasons (season_name, type_of_month, start_date, is_active)
     VALUES ($1, 'Ice', CURRENT_DATE, FALSE) RETURNING season_id`,
    [`motor-test-${randomUUID()}`],
  );
  return rows[0].season_id;
}

/** Inserta una batalla `ready` con los equipos de una dorada. Devuelve su `battle_id`. */
export async function crearBatallaReady(
  pool: pg.Pool,
  d: Dorada,
  over: { turnSeconds?: number | null; isTest?: boolean; p1?: string; p2?: string; status?: string } = {},
): Promise<number> {
  const season = await crearTemporada(pool);
  const sufijo = randomUUID().slice(0, 8);
  const { rows } = await pool.query(
    `INSERT INTO arena.battles
       (season_id, kind, is_test, format_id, rules, status, p1, p2, p1_team, p2_team, turn_seconds)
     VALUES ($1, 'league', $2, 'gen9pinchesgueysleague', $3, $4, $5, $6, $7, $8, $9)
     RETURNING battle_id`,
    [
      season,
      over.isTest ?? true,
      d.rules,
      over.status ?? 'ready',
      over.p1 ?? `uno_${sufijo}`,
      over.p2 ?? `dos_${sufijo}`,
      JSON.stringify(d.p1team),
      JSON.stringify(d.p2team),
      over.turnSeconds === undefined ? 150 : over.turnSeconds,
    ],
  );
  return Number(rows[0].battle_id);
}
