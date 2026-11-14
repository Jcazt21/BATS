import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ENGINE_VERSION } from '../../src/engine/sim.js';

const raiz = new URL('../../../', import.meta.url);
const leerJson = (ruta: string) => JSON.parse(readFileSync(new URL(ruta, raiz), 'utf8'));

describe('versión del motor', () => {
  it('ENGINE_VERSION coincide con la versión instalada de @pkmn/sim', () => {
    const instalada = leerJson('node_modules/@pkmn/sim/package.json').version;
    expect(ENGINE_VERSION).toBe(instalada);
  });

  it('el package.json de la raíz fija @pkmn/sim con versión exacta', () => {
    const fijada = leerJson('package.json').dependencies['@pkmn/sim'];
    expect(fijada).toMatch(/^\d+\.\d+\.\d+$/);
    expect(fijada).toBe(ENGINE_VERSION);
  });
});
