import { nuevoRegistro } from '../../src/core/start.js';
import type { BattleRecord } from '../../src/core/types.js';
import type { PokemonSet } from '../../src/engine/sim.js';
import type { Dorada } from './doradas.js';

/** Registro `ready` con los equipos y las reglas de una dorada. */
export function registroDe(d: Dorada, over: Partial<BattleRecord> = {}): BattleRecord {
  return {
    ...nuevoRegistro({
      rules: d.rules,
      p1: { name: d.p1, team: d.p1team as unknown as PokemonSet[] },
      p2: { name: d.p2, team: d.p2team as unknown as PokemonSet[] },
      turnSeconds: 150,
    }),
    ...over,
  };
}

export const AHORA = new Date('2026-11-17T12:00:00Z');
