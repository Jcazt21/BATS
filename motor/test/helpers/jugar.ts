import { apply } from '../../src/core/apply.js';
import { start } from '../../src/core/start.js';
import type { BattleRecord, Lado, Transition } from '../../src/core/types.js';
import type { Dorada } from './doradas.js';
import { AHORA, registroDe } from './registro.js';

export interface Paso {
  side: Lado;
  choice: string;
  resultado: Transition;
}

/** Líneas de `>p1 move x` / `>p2 switch 2` de un inputLog; `>forcelose` aparte. */
export function eleccionesDe(d: Dorada): { side: Lado; choice: string }[] {
  return d.inputLog.flatMap(linea => {
    const m = /^>(p1|p2) (.*)$/.exec(linea);
    return m && m[2] !== 'undo' ? [{ side: m[1] as Lado, choice: m[2] }] : [];
  });
}

/**
 * Juega una dorada entera con `start` + `apply`, una elección cada vez, partiendo solo del
 * registro anterior. Devuelve el registro final, todas las tandas y cada paso.
 */
export function jugarDorada(d: Dorada, over: Partial<BattleRecord> = {}) {
  const inicio = start(registroDe(d, over), { seed: d.seed, now: AHORA });
  let record = inicio.record;
  const tandas: string[][] = [inicio.newLines];
  const pasos: Paso[] = [];
  for (const { side, choice } of eleccionesDe(d)) {
    const resultado = apply(record, { type: 'choose', side, seq: record.seq, choice }, { now: AHORA });
    pasos.push({ side, choice, resultado });
    if (!resultado.ok) throw new Error(`${d.id}: ${side} ${choice} → ${resultado.code}: ${resultado.detail}`);
    record = resultado.record;
    if (resultado.newLines) tandas.push(resultado.newLines);
  }
  return { record, tandas, pasos };
}
