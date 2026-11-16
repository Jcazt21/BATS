import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { start } from '../../src/core/start.js';
import { cargarTandas, saveTransition, withBattleLock } from '../../src/db/repo.js';
import { crearBatallaReady, hayDb, poolDeTest } from '../helpers/db.js';
import { doradas } from '../helpers/doradas.js';

const dorada = doradas[0];
const AHORA = new Date('2026-11-17T12:00:00Z');

describe.skipIf(!hayDb)('repo (base desechable)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = poolDeTest();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('withBattleLock devuelve null si la batalla no existe', async () => {
    const r = await withBattleLock(pool, 999_999_999, async () => 'nunca');
    expect(r).toBeNull();
  });

  it('mapea la fila a BattleRecord en un solo sitio', async () => {
    const id = await crearBatallaReady(pool, dorada, { turnSeconds: 120 });
    const fila = await withBattleLock(pool, id, async f => f);
    expect(fila).not.toBeNull();
    const { record, kind, isTest } = fila!;
    expect(kind).toBe('league');
    expect(isTest).toBe(true);
    expect(record!.status).toBe('ready');
    expect(record!.rules).toBe(dorada.rules);
    expect(record!.turnSeconds).toBe(120);
    expect(record!.p1.team).toHaveLength(dorada.p1team.length);
    expect(record!.inputLog).toEqual([]);
    expect(record!.seed).toBeNull();
  });

  it('una batalla en team_select no tiene registro todavía', async () => {
    const id = await crearBatallaReady(pool, dorada, { status: 'team_select' });
    const fila = await withBattleLock(pool, id, async f => f);
    expect(fila!.estado).toBe('team_select');
    expect(fila!.record).toBeNull();
  });

  it('hace commit al volver', async () => {
    const id = await crearBatallaReady(pool, dorada);
    await withBattleLock(pool, id, async (f, tx) => {
      const { record, newLines } = start(f.record!, { seed: dorada.seed, now: AHORA });
      await saveTransition(tx, f, record, newLines);
    });
    const { rows } = await pool.query('SELECT status, seq, seed FROM arena.battles WHERE battle_id = $1', [id]);
    expect(rows[0]).toMatchObject({ status: 'active', seq: 1, seed: dorada.seed });
    const tandas = await cargarTandas(pool, id, 0, 1);
    expect(tandas).toHaveLength(1);
    expect(tandas[0].seq).toBe(1);
    expect(tandas[0].lines[0]).toMatch(/^\|/);
  });

  it('hace rollback si la función lanza: la tanda no queda a medias', async () => {
    const id = await crearBatallaReady(pool, dorada);
    await expect(
      withBattleLock(pool, id, async (f, tx) => {
        const { record, newLines } = start(f.record!, { seed: dorada.seed, now: AHORA });
        await saveTransition(tx, f, record, newLines);
        throw new Error('falla a mitad');
      }),
    ).rejects.toThrow('falla a mitad');
    const { rows } = await pool.query('SELECT status, seq FROM arena.battles WHERE battle_id = $1', [id]);
    expect(rows[0]).toMatchObject({ status: 'ready', seq: 0 });
    expect(await cargarTandas(pool, id, 0, 99)).toHaveLength(0);
  });

  it('saveTransition llama a arena.notify en la misma transacción', async () => {
    // Un realtime.send falso que anota en una tabla: con rollback no debe quedar rastro del aviso.
    const admin = await pool.connect();
    try {
      await admin.query('CREATE SCHEMA IF NOT EXISTS realtime');
      await admin.query('CREATE TABLE IF NOT EXISTS public.avisos_motor_test (topic text, payload jsonb)');
      await admin.query('TRUNCATE public.avisos_motor_test');
      await admin.query(
        `CREATE OR REPLACE FUNCTION realtime.send(jsonb, text, text, boolean) RETURNS void LANGUAGE sql
         AS $$ INSERT INTO public.avisos_motor_test VALUES ($3, $1) $$`,
      );
      const id = await crearBatallaReady(pool, dorada);
      await withBattleLock(pool, id, async (f, tx) => {
        const { record, newLines } = start(f.record!, { seed: dorada.seed, now: AHORA });
        await saveTransition(tx, f, record, newLines);
      });
      // Otros archivos de test guardan batallas en paralelo: solo cuentan los avisos de las nuestras.
      const { rows } = await admin.query('SELECT topic, payload FROM public.avisos_motor_test WHERE topic = $1', [`battle:${id}`]);
      expect(rows).toEqual([{ topic: `battle:${id}`, payload: { seq: 1 } }]);

      const id2 = await crearBatallaReady(pool, dorada);
      await withBattleLock(pool, id2, async (f, tx) => {
        const { record, newLines } = start(f.record!, { seed: dorada.seed, now: AHORA });
        await saveTransition(tx, f, record, newLines);
        throw new Error('rollback');
      }).catch(() => {});
      expect((await admin.query('SELECT 1 FROM public.avisos_motor_test WHERE topic = $1', [`battle:${id2}`])).rowCount).toBe(0);
    } finally {
      await admin.query('DROP SCHEMA realtime CASCADE');
      await admin.query('DROP TABLE IF EXISTS public.avisos_motor_test');
      admin.release();
    }
  });
});
