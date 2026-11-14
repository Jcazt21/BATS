import { describe, expect, it, vi } from 'vitest';

import entrypoint from '../../../api/motor.js';
import { ENGINE_VERSION } from '../../src/engine/sim.js';
import { HttpError } from '../../src/http/errors.js';
import handler from '../../src/http/handler.js';
import { checkEngine } from '../../src/http/health.js';
import { createRouter } from '../../src/http/router.js';

const pedir = (ruta: string, init?: RequestInit) => handler.fetch(new Request(`https://bats.test${ruta}`, init));

describe('GET /api/motor/health', () => {
  it('responde 200 con la versión del motor y el tiempo de una rejugada', async () => {
    const res = await pedir('/api/motor/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    const cuerpo = (await res.json()) as { replay_ms: number };
    expect(cuerpo).toMatchObject({ ok: true, engine: ENGINE_VERSION, node: process.version });
    expect(cuerpo.replay_ms).toBeGreaterThan(0);
    expect(cuerpo.replay_ms).toBeLessThan(2000);
  });

  it('no se cachea', async () => {
    const res = await pedir('/api/motor/health');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('la batalla embebida termina como se espera', () => {
    expect(checkEngine().ok).toBe(true);
  });
});

describe('router', () => {
  it.each([
    ['ruta desconocida', '/api/motor/no-existe', 'GET'],
    ['método distinto', '/api/motor/health', 'POST'],
    ['fuera del prefijo', '/api/otra/health', 'GET'],
  ])('%s → 404 con {detail, code}', async (_caso, ruta, method) => {
    const res = await pedir(ruta, { method });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: expect.any(String), code: 'not_found' });
  });

  it('extrae los parámetros de la ruta', async () => {
    const router = createRouter([
      { method: 'GET', path: '/battles/:id', handler: ({ params }) => Response.json(params) },
    ]);
    const res = await router(new Request('https://bats.test/api/motor/battles/42?since=3'));
    expect(await res.json()).toEqual({ id: '42' });
  });

  it('un HttpError se devuelve con su estado y la forma de FastAPI', async () => {
    const router = createRouter([
      { method: 'GET', path: '/x', handler: () => { throw new HttpError(409, 'stale', 'El turno ya avanzó'); } },
    ]);
    const res = await router(new Request('https://bats.test/api/motor/x'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ detail: 'El turno ya avanzó', code: 'stale' });
  });

  it('una excepción inesperada da 500 sin filtrar el mensaje', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = createRouter([
      { method: 'GET', path: '/x', handler: () => { throw new Error('semilla=secreta'); } },
    ]);
    const res = await router(new Request('https://bats.test/api/motor/x'));
    expect(res.status).toBe(500);
    const cuerpo = (await res.json()) as { code: string };
    expect(cuerpo.code).toBe('internal');
    expect(JSON.stringify(cuerpo)).not.toContain('secreta');
    consola.mockRestore();
  });
});

describe('api/motor.ts', () => {
  it('solo reexporta el handler', () => {
    expect(entrypoint).toBe(handler);
  });
});
