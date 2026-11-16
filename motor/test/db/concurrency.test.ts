import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HttpError } from '../../src/http/errors.js';
import { accionar, obtenerVista } from '../../src/service/battles.js';
import { crearBatallaReady, hayDb, poolDeTest } from '../helpers/db.js';
import { doradas } from '../helpers/doradas.js';
import { eleccionesDe } from '../helpers/jugar.js';

const dorada = doradas[0];
const [eleccionP1, eleccionP2] = eleccionesDe(dorada); // team preview de cada lado

describe.skipIf(!hayDb)('concurrencia (I4)', () => {
  // Dos pools: cada elección entra por su propia conexión, como dos funciones distintas.
  let poolA: pg.Pool;
  let poolB: pg.Pool;
  beforeAll(() => {
    poolA = poolDeTest(4);
    poolB = poolDeTest(4);
  });
  afterAll(async () => {
    await Promise.all([poolA.end(), poolB.end()]);
  });

  it('p1 y p2 eligen a la vez: una sola resolución, seq +1, ninguna elección se pierde (50 veces)', async () => {
    for (let i = 0; i < 50; i++) {
      const id = await crearBatallaReady(poolA, dorada);
      const fila = await poolA.query('SELECT p1, p2 FROM arena.battles WHERE battle_id = $1', [id]);
      const { p1, p2 } = fila.rows[0];
      const vista = await obtenerVista(poolA, id, p1, 0);
      expect(vista.seq).toBe(1);

      const [a, b] = await Promise.all([
        accionar(poolA, id, p1, { type: 'choose', seq: 1, choice: eleccionP1.choice }),
        accionar(poolB, id, p2, { type: 'choose', seq: 1, choice: eleccionP2.choice }),
      ]);
      // Exactamente una de las dos resolvió el turno.
      expect([a.resolved, b.resolved].filter(Boolean)).toHaveLength(1);

      const { rows } = await poolA.query(
        'SELECT seq, p1_choice, p2_choice, cardinality(input_log) AS n FROM arena.battles WHERE battle_id = $1',
        [id],
      );
      expect(rows[0].seq).toBe(2);
      expect(rows[0].p1_choice).toBeNull();
      expect(rows[0].p2_choice).toBeNull();
      // >start, 2 × >player, y las dos elecciones de team preview.
      expect(rows[0].n).toBe(5);
      const tandas = await poolA.query('SELECT count(*)::int AS n FROM arena.battle_updates WHERE battle_id = $1', [id]);
      expect(tandas.rows[0].n).toBe(2);
    }
  }, 120_000);

  it('con el bloqueo tomado por otra conexión responde 503 busy en vez de colgarse', async () => {
    const id = await crearBatallaReady(poolA, dorada);
    const { rows } = await poolA.query('SELECT p1 FROM arena.battles WHERE battle_id = $1', [id]);
    const ocupado = await poolB.connect();
    try {
      await ocupado.query('BEGIN');
      await ocupado.query('SELECT 1 FROM arena.battles WHERE battle_id = $1 FOR UPDATE', [id]);
      const inicio = Date.now();
      const error = await obtenerVista(poolA, id, rows[0].p1, 0).catch(e => e);
      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({ status: 503, code: 'busy' });
      expect(Date.now() - inicio).toBeLessThan(6_000);
    } finally {
      await ocupado.query('ROLLBACK');
      ocupado.release();
    }
  }, 20_000);
});
