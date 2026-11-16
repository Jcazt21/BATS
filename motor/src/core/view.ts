import { extractChannelMessages } from '../engine/sim.js';
import type { BattleRecord, Rol } from './types.js';

/** Canal de `extractChannelMessages`: 1 y 2 son los jugadores, 0 el espectador. */
const CANAL = { p1: 1, p2: 2, spectator: 0 } as const;

/**
 * Único punto de filtrado de información oculta (I1): de cada tanda cruda deja solo lo que ve
 * `rol`. El canal omnisciente (-1) no sale nunca por aquí.
 */
export function viewFor(rol: Rol, tandas: string[][]): string[][] {
  const canal = CANAL[rol];
  return tandas.map(tanda => (tanda.length ? extractChannelMessages(tanda.join('\n'), [canal])[canal] : []));
}

/** La petición del simulador de `rol`; el espectador no tiene y la batalla terminada tampoco. */
export function requestFor(record: BattleRecord, rol: Rol): unknown | null {
  return rol === 'spectator' ? null : record.requests[rol];
}

export interface BattleView {
  role: Rol;
  status: BattleRecord['status'];
  seq: number;
  turn: number;
  players: { p1: string; p2: string };
  winner: string | null;
  endType: BattleRecord['endType'];
  endReason: BattleRecord['endReason'];
  turnSeconds: number | null;
  deadlineAt: string | null;
  /** Su propia petición. */
  request: unknown | null;
  /** Ya eligió en este turno (sin decir qué). */
  chosen: boolean;
  lines: string[][];
}

/**
 * Lo que un cliente puede recibir de una batalla. Se construye campo a campo (nunca copiando
 * `record`): lo que no se nombra aquí no sale (semilla, inputLog, elecciones, equipos).
 */
export function vistaDe(record: BattleRecord, rol: Rol, tandas: string[][]): BattleView {
  return {
    role: rol,
    status: record.status,
    seq: record.seq,
    turn: record.turn,
    players: { p1: record.p1.name, p2: record.p2.name },
    winner: record.winner,
    endType: record.endType,
    endReason: record.endReason,
    turnSeconds: record.turnSeconds,
    deadlineAt: record.deadlineAt ? new Date(record.deadlineAt).toISOString() : null,
    request: requestFor(record, rol),
    chosen: rol !== 'spectator' && record.pending[rol] !== null,
    lines: viewFor(rol, tandas),
  };
}
