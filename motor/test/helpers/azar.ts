import { apply } from '../../src/core/apply.js';
import { normalizeLog } from '../../src/core/hash.js';
import { nuevoRegistro, start } from '../../src/core/start.js';
import { ladosPendientes } from '../../src/core/timer.js';
import type { BattleRecord, Lado } from '../../src/core/types.js';
import { Colector } from '../../src/engine/replay.js';
import { Battle, Teams, type PokemonSet } from '../../src/engine/sim.js';
import { crearAzar, eleccionesPosibles } from '../../scripts/eleccion-azar.js';
import { doradas } from './doradas.js';

const EQUIPOS = doradas.flatMap(d => [d.p1team, d.p2team] as unknown as PokemonSet[][]);
const RULES = doradas[0].rules;
const MAX_PASOS = 1500;

export interface Partida {
  record: BattleRecord;
  /** Todas las líneas emitidas, en orden. */
  lineas: string[];
  /** Elecciones aceptadas, en el orden en que se aplicaron. */
  elecciones: { side: Lado; choice: string }[];
  seed: string;
}

/** Hex de 32 caracteres derivado del azar: el formato `sodium,<hex>` de las doradas. */
function semillaDe(azar: () => number): string {
  let hex = '';
  while (hex.length < 32) hex += Math.floor(azar() * 16).toString(16);
  return `sodium,${hex}`;
}

/** Una batalla entera con `apply`, pasando el registro por JSON entre cada paso (sin estado). */
export function jugarAlAzar(semilla: number, ahora = new Date('2026-11-17T12:00:00Z')): Partida {
  const azar = crearAzar(semilla);
  const equipo = () => EQUIPOS[Math.floor(azar() * EQUIPOS.length)];
  const seed = semillaDe(azar);
  const inicio = start(
    nuevoRegistro({
      rules: RULES,
      p1: { name: 'azar1', team: equipo() },
      p2: { name: 'azar2', team: equipo() },
      turnSeconds: 150,
    }),
    { seed, now: ahora },
  );
  let record = inicio.record;
  const lineas = [...inicio.newLines];
  const elecciones: Partida['elecciones'] = [];

  for (let paso = 0; record.status === 'active'; paso++) {
    if (paso > MAX_PASOS) throw new Error(`semilla ${semilla}: la batalla no termina`);
    const lados = ladosPendientes(record);
    const side = lados[Math.floor(azar() * lados.length)];
    let hecho = false;
    for (const choice of eleccionesPosibles(record.requests[side], azar)) {
      const guardado = JSON.parse(JSON.stringify(record)) as BattleRecord; // lo único que sobrevive entre pasos
      const t = apply(guardado, { type: 'choose', side, seq: guardado.seq, choice }, { now: ahora });
      if (t.ok) {
        record = t.record;
        if (t.newLines) lineas.push(...t.newLines);
        elecciones.push({ side, choice });
        hecho = true;
        break;
      }
      if (t.record) record = t.record; // petición reemitida
    }
    if (!hecho) throw new Error(`semilla ${semilla}: ${side} sin elección válida en el turno ${record.turn}`);
  }
  return { record, lineas, elecciones, seed };
}

/** La misma batalla en un solo `Battle` en memoria: la referencia contra la que se compara. */
export function jugarContinua(p: Partida) {
  const colector = new Colector();
  const opciones = { formatid: RULES, seed: p.seed, send: colector.onSend } as unknown as ConstructorParameters<typeof Battle>[0];
  const battle = new Battle(opciones);
  battle.setPlayer('p1', { name: p.record.p1.name, team: Teams.pack(p.record.p1.team) });
  battle.setPlayer('p2', { name: p.record.p2.name, team: Teams.pack(p.record.p2.team) });
  battle.sendUpdates();
  for (const { side, choice } of p.elecciones) {
    if (!battle.choose(side, choice)) throw new Error(`la continua rechazó ${side} ${choice}`);
    battle.sendUpdates();
  }
  return { battle, lineas: colector.lines, log: normalizeLog(colector.lines) };
}
