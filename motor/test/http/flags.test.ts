import { describe, expect, it } from 'vitest';

import { arenaAllows, arenaMode } from '../../src/http/flags.js';
import handler from '../../src/http/handler.js';
import { createRouter, type Ruta } from '../../src/http/router.js';

describe('arenaMode', () => {
  it.each([
    [undefined, 'off'],
    ['', 'off'],
    ['off', 'off'],
    ['admins', 'admins'],
    ['all', 'all'],
    [' Admins ', 'admins'],
    ['true', 'off'],
    ['todos', 'off'],
  ])('BATS_ARENA_MODE=%j → %s', (valor, esperado) => {
    expect(arenaMode({ BATS_ARENA_MODE: valor })).toBe(esperado);
  });
});

describe('arenaAllows', () => {
  const admin = { isAdmin: true };
  const jugador = { isAdmin: false };

  it('off no deja pasar a nadie', () => {
    expect(arenaAllows('off', admin)).toBe(false);
  });

  it('admins deja pasar solo a los administradores', () => {
    expect(arenaAllows('admins', admin)).toBe(true);
    expect(arenaAllows('admins', jugador)).toBe(false);
    expect(arenaAllows('admins', null)).toBe(false);
  });

  it('all deja pasar a cualquiera', () => {
    expect(arenaAllows('all', jugador)).toBe(true);
    expect(arenaAllows('all', null)).toBe(true);
  });
});

// I12: con el flag en `off`, todo salvo `health` responde 404.
describe('puerta del router', () => {
  const rutas: Ruta[] = [
    { method: 'GET', path: '/health', publica: true, handler: () => Response.json({ ok: true }) },
    { method: 'GET', path: '/battles/:id', handler: () => Response.json({ id: 1 }) },
  ];
  const pedir = (router: ReturnType<typeof createRouter>, ruta: string) =>
    router(new Request(`https://bats.test/api/motor${ruta}`)).then(res => res.status);

  it('off: la ruta protegida da 404 y health sigue viva', async () => {
    const router = createRouter(rutas, { mode: () => 'off', identify: async () => ({ isAdmin: true }) });
    expect(await pedir(router, '/battles/1')).toBe(404);
    expect(await pedir(router, '/health')).toBe(200);
  });

  it('admins: pasa un administrador; un jugador o un anónimo reciben 404', async () => {
    const con = (identidad: { isAdmin: boolean } | null) =>
      createRouter(rutas, { mode: () => 'admins', identify: async () => identidad });
    expect(await pedir(con({ isAdmin: true }), '/battles/1')).toBe(200);
    expect(await pedir(con({ isAdmin: false }), '/battles/1')).toBe(404);
    expect(await pedir(con(null), '/battles/1')).toBe(404);
  });

  it('admins sin forma de identificar a quien llama: 404 (cerrado por defecto)', async () => {
    const router = createRouter(rutas, { mode: () => 'admins' });
    expect(await pedir(router, '/battles/1')).toBe(404);
  });

  it('all: pasa cualquiera', async () => {
    const router = createRouter(rutas, { mode: () => 'all' });
    expect(await pedir(router, '/battles/1')).toBe(200);
  });

  it('sin opciones el modo sale de BATS_ARENA_MODE, y ausente es off', async () => {
    delete process.env.BATS_ARENA_MODE;
    const router = createRouter(rutas);
    expect(await pedir(router, '/battles/1')).toBe(404);
    expect(await pedir(router, '/health')).toBe(200);
  });

  it('el handler real mantiene health viva con el flag en off', async () => {
    delete process.env.BATS_ARENA_MODE;
    const res = await handler.fetch(new Request('https://bats.test/api/motor/health'));
    expect(res.status).toBe(200);
  });
});
