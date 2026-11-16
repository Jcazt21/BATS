import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_CONEXIONES, cerrarPool, getPool } from '../../src/db/pool.js';

afterEach(async () => {
  await cerrarPool();
  vi.unstubAllEnvs();
});

describe('pool', () => {
  it('es un singleton de módulo', () => {
    vi.stubEnv('BATS_DB_DSN', 'postgresql://u@127.0.0.1:1/nada');
    expect(getPool()).toBe(getPool());
  });

  it('limita las conexiones a 3 o menos', () => {
    vi.stubEnv('BATS_DB_DSN', 'postgresql://u@127.0.0.1:1/nada');
    expect(MAX_CONEXIONES).toBeLessThanOrEqual(3);
    expect(getPool().options.max).toBe(MAX_CONEXIONES);
  });

  it('cierra rápido las conexiones ociosas', () => {
    vi.stubEnv('BATS_DB_DSN', 'postgresql://u@127.0.0.1:1/nada');
    expect(getPool().options.idleTimeoutMillis).toBeLessThanOrEqual(10_000);
  });

  it('sin BATS_DB_DSN falla con un mensaje claro', () => {
    vi.stubEnv('BATS_DB_DSN', '');
    expect(() => getPool()).toThrow(/BATS_DB_DSN/);
  });
});
