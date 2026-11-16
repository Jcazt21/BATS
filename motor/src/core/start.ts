import { Battle, Teams } from '../engine/sim.js';
import { Colector } from '../engine/replay.js';
import { hashLog } from './hash.js';
import { nuevaFecha } from './timer.js';
import type { BattleRecord, Ctx, Player } from './types.js';

/** Registro recién creado, a la espera de `start`. */
export function nuevoRegistro(datos: {
  rules: string;
  p1: Player;
  p2: Player;
  turnSeconds: number | null;
}): BattleRecord {
  return {
    rules: datos.rules,
    seed: null,
    p1: datos.p1,
    p2: datos.p2,
    inputLog: [],
    pending: { p1: null, p2: null },
    requests: { p1: null, p2: null },
    seq: 0,
    logLines: 0,
    logHash: null,
    turn: 0,
    status: 'ready',
    turnSeconds: datos.turnSeconds,
    deadlineAt: null,
    winner: null,
    endType: null,
    endReason: null,
  };
}

/**
 * Arranca la batalla: crea el simulador con la semilla dada, sienta a los dos jugadores y deja
 * la primera tanda (team preview) y las peticiones. Sin IO; no muta `record`.
 */
export function start(record: BattleRecord, { seed, now }: Ctx & { seed: string }): { record: BattleRecord; newLines: string[] } {
  if (record.status !== 'ready') throw new Error(`start exige status 'ready' (llegó '${record.status}')`);

  const colector = new Colector();
  // `formatid` y `seed` son cadenas libres (D5): el tipo del simulador pide ID y PRNGSeed.
  const opciones = { formatid: record.rules, seed, send: colector.onSend } as unknown as ConstructorParameters<typeof Battle>[0];
  const battle = new Battle(opciones);
  battle.setPlayer('p1', { name: record.p1.name, team: Teams.pack(record.p1.team) });
  battle.setPlayer('p2', { name: record.p2.name, team: Teams.pack(record.p2.team) });
  battle.sendUpdates();

  const newLines = colector.lines;
  return {
    record: {
      ...record,
      seed,
      inputLog: [...battle.inputLog],
      pending: { p1: null, p2: null },
      requests: colector.requests,
      seq: 1,
      logLines: newLines.length,
      logHash: hashLog(newLines),
      turn: battle.turn,
      status: 'active',
      deadlineAt: nuevaFecha(now, record.turnSeconds),
    },
    newLines,
  };
}
