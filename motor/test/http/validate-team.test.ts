import { describe, expect, it } from 'vitest';

import { crearApp } from '../../src/http/app.js';
import { doradas } from '../helpers/doradas.js';

const dorada = doradas[0];
const ENV = { BATS_MOTOR_TOKEN: 'token-del-motor' };

// Ninguna de estas rutas toca la base ni identifica jugadores.
const app = (mode: 'off' | 'admins' | 'all', env: Record<string, string | undefined> = ENV) =>
  crearApp({
    pool: () => {
      throw new Error('validate-team no debe tocar la base');
    },
    identify: async () => {
      throw new Error('validate-team no identifica jugadores');
    },
    mode: () => mode,
    env,
  });

const validar = (a: ReturnType<typeof app>, cuerpo: unknown, token?: string) =>
  a.fetch(
    new Request('https://bats.test/api/motor/validate-team', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(cuerpo),
    }),
  );

describe('POST /api/motor/validate-team (F2.10)', () => {
  it('sin token de servicio → 401', async () => {
    expect((await validar(app('all'), { rules: dorada.rules, team: dorada.p1team })).status).toBe(401);
  });

  it('token incorrecto → 401', async () => {
    expect((await validar(app('all'), { rules: dorada.rules, team: dorada.p1team }, 'otro')).status).toBe(401);
  });

  it('token sin configurar → 503 (falla cerrado)', async () => {
    const res = await validar(app('all', {}), { rules: dorada.rules, team: dorada.p1team }, 'lo-que-sea');
    expect(res.status).toBe(503);
  });

  it('con Arena apagada responde 404 aunque el token sea correcto (I12)', async () => {
    const res = await validar(app('off'), { rules: dorada.rules, team: dorada.p1team }, 'token-del-motor');
    expect(res.status).toBe(404);
  });

  it('en modo admins pasa: la llama FastAPI, que no es administrador', async () => {
    const res = await validar(app('admins'), { rules: dorada.rules, team: dorada.p1team }, 'token-del-motor');
    expect(res.status).toBe(200);
  });

  it('equipo legal → { errors: [] }', async () => {
    // El p2 de la dorada-01 cumple la Item Clause; su p1 no (ver Bitácora, fase 1, punto 6).
    const res = await validar(app('all'), { rules: dorada.rules, team: dorada.p2team }, 'token-del-motor');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ errors: [] });
  });

  it('objeto repetido (Item Clause) → error', async () => {
    const res = await validar(app('all'), { rules: dorada.rules, team: dorada.p1team }, 'token-del-motor');
    expect(((await res.json()) as { errors: string[] }).errors.join(' ')).toMatch(/Item Clause/);
  });

  it('movimiento ilegal → errores del simulador', async () => {
    const team = [{ ...(dorada.p1team[0] as object), moves: ['Splash de mentira'] }];
    const res = await validar(app('all'), { rules: dorada.rules, team }, 'token-del-motor');
    expect(res.status).toBe(200);
    const { errors } = (await res.json()) as { errors: string[] };
    expect(errors.length).toBeGreaterThan(0);
  });

  it('formato inválido → error claro, no excepción', async () => {
    const res = await validar(app('all'), { rules: 'noexiste@@@xx', team: dorada.p1team }, 'token-del-motor');
    expect(res.status).toBe(200);
    const { errors } = (await res.json()) as { errors: string[] };
    expect(errors[0]).toMatch(/formato/i);
  });

  it.each([{ team: [] }, { rules: 'x' }, { rules: 'x', team: 'no' }])('cuerpo incompleto %j → 400', async cuerpo => {
    expect((await validar(app('all'), cuerpo, 'token-del-motor')).status).toBe(400);
  });
});
