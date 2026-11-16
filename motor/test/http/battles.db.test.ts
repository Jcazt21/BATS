import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { viewFor } from '../../src/core/view.js';
import { crearApp } from '../../src/http/app.js';
import { crearBatallaReady, hayDb, poolDeTest } from '../helpers/db.js';
import { doradas } from '../helpers/doradas.js';
import { eleccionesDe } from '../helpers/jugar.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const j = async (res: Response): Promise<any> => res.json();

const dorada = doradas[0];
const elecciones = eleccionesDe(dorada);
const PREVIEW = { p1: elecciones[0].choice, p2: elecciones[1].choice };
const ENV = { BATS_INGEST_TOKEN: 'ingesta-secreta', BATS_API_URL: 'https://bats.test' };

describe.skipIf(!hayDb)('API de batallas (HTTP + Postgres)', () => {
  let pool: pg.Pool;
  const fetchFalso = vi.fn(async () => new Response('{}'));
  const esperas: Promise<unknown>[] = [];
  let app: ReturnType<typeof crearApp>;

  beforeAll(() => {
    pool = poolDeTest();
    app = crearApp({
      pool: () => pool,
      mode: () => 'all',
      env: ENV,
      // La identidad llega en una cabecera: la autenticación real se prueba en auth.test.ts.
      identify: async req => ({ username: req.headers.get('x-usuario') ?? '', isAdmin: false }),
      fetch: fetchFalso as unknown as typeof fetch,
      waitUntil: p => void esperas.push(p),
    });
  });
  afterAll(async () => {
    await Promise.allSettled(esperas);
    await pool.end();
  });

  const llamar = (ruta: string, usuario: string | null, init: RequestInit = {}) =>
    app.fetch(
      new Request(`https://bats.test/api/motor${ruta}`, {
        ...init,
        headers: { ...(usuario ? { 'x-usuario': usuario } : {}), 'content-type': 'application/json' },
      }),
    );
  const post = (ruta: string, usuario: string, cuerpo: unknown) =>
    llamar(ruta, usuario, { method: 'POST', body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) });

  async function nueva(over: Parameters<typeof crearBatallaReady>[2] = {}) {
    const id = await crearBatallaReady(pool, dorada, over);
    const { rows } = await pool.query('SELECT p1, p2 FROM arena.battles WHERE battle_id = $1', [id]);
    return { id, p1: rows[0].p1 as string, p2: rows[0].p2 as string };
  }

  describe('GET /battles/:id (F2.7)', () => {
    it('un participante recibe su vista y su petición; sin secretos', async () => {
      const { id, p1 } = await nueva();
      const res = await llamar(`/battles/${id}`, p1);
      expect(res.status).toBe(200);
      const vista = await j(res);
      expect(vista).toMatchObject({ id, you: 'p1', status: 'active', seq: 1, chosen: false });
      expect(vista.request).not.toBeNull();
      expect(vista.updates).toHaveLength(1);
      expect(vista.updates[0].seq).toBe(1);
      expect(typeof vista.serverNow).toBe('string');
      const texto = JSON.stringify(vista);
      for (const secreto of ['seed', 'inputLog', 'input_log', 'pending', 'p1_team', 'sodium,']) {
        expect(texto).not.toContain(secreto);
      }
    });

    it('otro jugador entra como espectador, sin petición', async () => {
      const { id } = await nueva();
      const vista = await j(await llamar(`/battles/${id}`, 'curioso'));
      expect(vista.you).toBe('spectator');
      expect(vista.request).toBeNull();
    });

    it('las líneas llegan ya filtradas por el canal de cada rol', async () => {
      const { id, p1 } = await nueva();
      const v1 = await j(await llamar(`/battles/${id}`, p1));
      const { rows } = await pool.query('SELECT lines FROM arena.battle_updates WHERE battle_id = $1 AND seq = 1', [id]);
      expect(v1.updates[0].lines).toEqual(viewFor('p1', [rows[0].lines])[0]);
      expect(v1.updates[0].lines.join(' ')).not.toContain('|split|');
    });

    it('since=N devuelve solo las tandas posteriores', async () => {
      const { id, p1, p2 } = await nueva();
      await llamar(`/battles/${id}`, p1);
      expect((await j(await llamar(`/battles/${id}?since=1`, p1))).updates).toEqual([]);
      await post(`/battles/${id}/choose`, p1, { seq: 1, choice: PREVIEW.p1 });
      await post(`/battles/${id}/choose`, p2, { seq: 1, choice: PREVIEW.p2 });
      const vista = await j(await llamar(`/battles/${id}?since=1`, p1));
      expect(vista.updates.map((u: { seq: number }) => u.seq)).toEqual([2]);
      expect(vista.seq).toBe(2);
    });

    it('inexistente → 404 con {detail, code}', async () => {
      const res = await llamar('/battles/999999999', 'alguien');
      expect(res.status).toBe(404);
      expect(await j(res)).toEqual({ detail: expect.any(String), code: 'not_found' });
    });

    it('un id que no es número → 404', async () => {
      expect((await llamar('/battles/abc', 'alguien')).status).toBe(404);
    });

    it('sin identidad → 401', async () => {
      const appSinId = crearApp({
        pool: () => pool,
        mode: () => 'all',
        env: ENV,
        identify: async () => {
          const { HttpError } = await import('../../src/http/errors.js');
          throw new HttpError(401, 'unauthorized', 'Falta el token de autenticación.');
        },
      });
      const res = await appSinId.fetch(new Request('https://bats.test/api/motor/battles/1'));
      expect(res.status).toBe(401);
    });

    it('una batalla en team_select se ve sin tandas ni petición', async () => {
      const { id, p1 } = await nueva({ status: 'team_select' });
      const vista = await j(await llamar(`/battles/${id}`, p1));
      expect(vista).toMatchObject({ status: 'team_select', seq: 0, updates: [], request: null });
    });

    it('dos GET simultáneos sobre una batalla ready la inician una sola vez', async () => {
      const { id, p1, p2 } = await nueva();
      const [a, b] = await Promise.all([llamar(`/battles/${id}`, p1), llamar(`/battles/${id}`, p2)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      const { rows } = await pool.query(
        'SELECT seq, (SELECT count(*)::int FROM arena.battle_updates u WHERE u.battle_id = b.battle_id) AS tandas FROM arena.battles b WHERE battle_id = $1',
        [id],
      );
      expect(rows[0]).toEqual({ seq: 1, tandas: 1 });
    });
  });

  describe('acciones (F2.8)', () => {
    it('primera elección: 200 sin resolver; segunda: turno resuelto con fila y tanda persistidas', async () => {
      const { id, p1, p2 } = await nueva();
      await llamar(`/battles/${id}`, p1);

      const r1 = await post(`/battles/${id}/choose`, p1, { seq: 1, choice: PREVIEW.p1 });
      expect(r1.status).toBe(200);
      expect(await j(r1)).toEqual({ seq: 1, resolved: false });
      expect((await j(await llamar(`/battles/${id}`, p1))).chosen).toBe(true);
      expect((await j(await llamar(`/battles/${id}`, p2))).chosen).toBe(false);

      const r2 = await post(`/battles/${id}/choose`, p2, { seq: 1, choice: PREVIEW.p2 });
      expect(await j(r2)).toEqual({ seq: 2, resolved: true });
      const { rows } = await pool.query(
        'SELECT seq, turn, (SELECT count(*)::int FROM arena.battle_updates u WHERE u.battle_id = b.battle_id) AS tandas FROM arena.battles b WHERE battle_id = $1',
        [id],
      );
      expect(rows[0]).toMatchObject({ seq: 2, tandas: 2 });
    });

    it('no participante → 403', async () => {
      const { id, p1 } = await nueva();
      await llamar(`/battles/${id}`, p1);
      for (const accion of ['choose', 'undo', 'forfeit', 'timeout']) {
        const res = await post(`/battles/${id}/${accion}`, 'intruso', { seq: 1, choice: PREVIEW.p1 });
        expect(res.status, accion).toBe(403);
      }
    });

    it('seq desfasado → 409 stale', async () => {
      const { id, p1 } = await nueva();
      await llamar(`/battles/${id}`, p1);
      const res = await post(`/battles/${id}/choose`, p1, { seq: 7, choice: PREVIEW.p1 });
      expect(res.status).toBe(409);
      expect((await j(res)).code).toBe('stale');
    });

    it('elección inválida → 422 con el mensaje del simulador y nada guardado', async () => {
      const { id, p1 } = await nueva();
      await llamar(`/battles/${id}`, p1);
      const res = await post(`/battles/${id}/choose`, p1, { seq: 1, choice: 'move 1' });
      expect(res.status).toBe(422);
      const cuerpo = await j(res);
      expect(cuerpo.code).toBe('invalid_choice');
      expect(cuerpo.detail.length).toBeGreaterThan(0);
      const { rows } = await pool.query('SELECT p1_choice, seq FROM arena.battles WHERE battle_id = $1', [id]);
      expect(rows[0]).toEqual({ p1_choice: null, seq: 1 });
    });

    it('undo retira la elección propia; sin elección → 409', async () => {
      const { id, p1 } = await nueva();
      await llamar(`/battles/${id}`, p1);
      expect((await post(`/battles/${id}/undo`, p1, {})).status).toBe(409);
      await post(`/battles/${id}/choose`, p1, { seq: 1, choice: PREVIEW.p1 });
      expect((await post(`/battles/${id}/undo`, p1, {})).status).toBe(200);
      expect((await j(await llamar(`/battles/${id}`, p1))).chosen).toBe(false);
    });

    it('timeout antes de tiempo → 409 not_expired; vencido → pierde quien no eligió', async () => {
      const { id, p1, p2 } = await nueva({ turnSeconds: 60 });
      await llamar(`/battles/${id}`, p1);
      const pronto = await post(`/battles/${id}/timeout`, p1, {});
      expect(pronto.status).toBe(409);
      expect((await j(pronto)).code).toBe('not_expired');

      await post(`/battles/${id}/choose`, p1, { seq: 1, choice: PREVIEW.p1 });
      await pool.query("UPDATE arena.battles SET deadline_at = now() - interval '1 second' WHERE battle_id = $1", [id]);
      const res = await post(`/battles/${id}/timeout`, p1, {});
      expect(res.status).toBe(200);
      const { rows } = await pool.query('SELECT status, winner, end_type, end_reason FROM arena.battles WHERE battle_id = $1', [id]);
      expect(rows[0]).toEqual({ status: 'finished', winner: p1, end_type: 'forfeit', end_reason: 'timeout' });
      expect(p2).toBeTruthy();
    });

    it.each([
      ['JSON inválido', '{no es json'],
      ['sin choice', { seq: 1 }],
      ['choice con caracteres no permitidos', { seq: 1, choice: 'move 1; DROP' }],
      ['choice demasiado largo', { seq: 1, choice: 'a'.repeat(81) }],
      ['choice vacío', { seq: 1, choice: '' }],
      ['seq no entero', { seq: 'x', choice: 'move 1' }],
      ['cuerpo mayor de 2 KB', { seq: 1, choice: 'move 1', relleno: 'x'.repeat(3000) }],
    ])('choose con %s → 400', async (_caso, cuerpo) => {
      const { id, p1 } = await nueva();
      await llamar(`/battles/${id}`, p1);
      expect((await post(`/battles/${id}/choose`, p1, cuerpo)).status).toBe(400);
    });

    it('la identidad sale de la sesión: un `side` en el cuerpo no cuenta (I5)', async () => {
      const { id, p1, p2 } = await nueva();
      await llamar(`/battles/${id}`, p1);
      await post(`/battles/${id}/choose`, p1, { seq: 1, choice: PREVIEW.p1, side: 'p2', username: p2 });
      const { rows } = await pool.query('SELECT p1_choice, p2_choice FROM arena.battles WHERE battle_id = $1', [id]);
      expect(rows[0]).toEqual({ p1_choice: PREVIEW.p1, p2_choice: null });
    });
  });

  describe('fin de batalla (F2.9)', () => {
    it('rendirse: finished, finished_at, ingest pending y aviso de ingesta con waitUntil', async () => {
      fetchFalso.mockClear();
      const { id, p1, p2 } = await nueva({ isTest: false });
      await llamar(`/battles/${id}`, p1);
      const res = await post(`/battles/${id}/forfeit`, p2, {});
      expect(res.status).toBe(200);
      await Promise.allSettled(esperas);

      const { rows } = await pool.query(
        'SELECT status, winner, end_type, finished_at IS NOT NULL AS terminada, ingest_status FROM arena.battles WHERE battle_id = $1',
        [id],
      );
      expect(rows[0]).toEqual({ status: 'finished', winner: p1, end_type: 'forfeit', terminada: true, ingest_status: 'pending' });

      expect(fetchFalso).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`https://bats.test/api/ingest/arena/${id}`);
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer ingesta-secreta');
    });

    it('una batalla de prueba queda en skipped y no avisa a la ingesta', async () => {
      fetchFalso.mockClear();
      const { id, p1, p2 } = await nueva({ isTest: true });
      await llamar(`/battles/${id}`, p1);
      await post(`/battles/${id}/forfeit`, p2, {});
      await Promise.allSettled(esperas);
      const { rows } = await pool.query('SELECT ingest_status FROM arena.battles WHERE battle_id = $1', [id]);
      expect(rows[0].ingest_status).toBe('skipped');
      expect(fetchFalso).not.toHaveBeenCalled();
    });

    it('si el aviso de ingesta falla, el turno no falla', async () => {
      fetchFalso.mockClear();
      fetchFalso.mockRejectedValueOnce(new Error('sin red'));
      const { id, p1, p2 } = await nueva({ isTest: false });
      await llamar(`/battles/${id}`, p1);
      const res = await post(`/battles/${id}/forfeit`, p2, {});
      expect(res.status).toBe(200);
      await Promise.allSettled(esperas);
    });

    it('una batalla terminada no admite más acciones (409) pero se sigue pudiendo leer', async () => {
      const { id, p1, p2 } = await nueva();
      await llamar(`/battles/${id}`, p1);
      await post(`/battles/${id}/forfeit`, p2, {});
      expect((await post(`/battles/${id}/choose`, p1, { seq: 2, choice: 'move 1' })).status).toBe(409);
      const vista = await j(await llamar(`/battles/${id}`, p1));
      expect(vista).toMatchObject({ status: 'finished', winner: p1, endType: 'forfeit', endReason: 'forfeit', request: null });
    });
  });
});
