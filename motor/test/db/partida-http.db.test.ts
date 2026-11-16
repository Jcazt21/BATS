import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { jugarPartidaHttp } from '../../scripts/partida-http.js';
import { hayDb, poolDeTest } from '../helpers/db.js';

describe.skipIf(!hayDb)('E2E por HTTP (F2.11)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = poolDeTest();
  });
  afterAll(async () => {
    await pool.end();
  });

  it.each([1, 2])(
    'dos jugadores al azar terminan una batalla solo por HTTP y ninguno ve datos del otro (semilla %i)',
    async semilla => {
      const r = await jugarPartidaHttp(pool, semilla);
      expect(r.estado).toBe('finished');
      expect(r.ganador === null || typeof r.ganador === 'string').toBe(true);
      expect(r.turnos).toBeGreaterThan(1);
      expect(r.filtraciones).toEqual([]);
      // La batalla quedó guardada en la base: tandas contiguas desde 1.
      const { rows } = await pool.query(
        'SELECT count(*)::int AS n, max(seq) AS maxseq FROM arena.battle_updates WHERE battle_id = $1',
        [r.id],
      );
      expect(rows[0].n).toBe(rows[0].maxseq);
    },
    180_000,
  );
});
