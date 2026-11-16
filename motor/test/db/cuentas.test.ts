import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cuentaPorEmail } from '../../src/db/repo.js';
import { hayDb, poolDeTest } from '../helpers/db.js';

describe.skipIf(!hayDb)('cuentaPorEmail', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = poolDeTest();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('encuentra la cuenta sin distinguir mayúsculas y no enlaza user_id', async () => {
    const tag = randomUUID().slice(0, 8);
    await pool.query('INSERT INTO tournament.player_accounts (email, username, is_admin) VALUES ($1, $2, TRUE)', [
      `Jugador.${tag}@Liga.test`,
      `Jugador_${tag}`,
    ]);
    const cuenta = await cuentaPorEmail(pool, `jugador.${tag}@liga.test`);
    expect(cuenta).toEqual({ userId: null, username: `Jugador_${tag}`, isAdmin: true });
  });

  it('devuelve null si no existe', async () => {
    expect(await cuentaPorEmail(pool, 'nadie@liga.test')).toBeNull();
  });
});
