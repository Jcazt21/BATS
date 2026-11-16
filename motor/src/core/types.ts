import type { PokemonSet } from '../engine/sim.js';

export type Lado = 'p1' | 'p2';
export type Rol = Lado | 'spectator';

export interface Player {
  name: string;
  team: PokemonSet[];
}

/** Lo que se persiste de una batalla (espejo de las columnas de arena.battles que usa el motor). */
export interface BattleRecord {
  rules: string;
  seed: string | null;
  p1: Player;
  p2: Player;
  inputLog: string[];
  /** Elección ya validada de un lado que espera al rival; todavía no está en `inputLog`. */
  pending: { p1: string | null; p2: string | null };
  /** Petición vigente de cada lado (la del simulador, sin tocar). */
  requests: { p1: unknown | null; p2: unknown | null };
  /** Nº de tandas emitidas; es el cursor de concurrencia optimista (D9). */
  seq: number;
  /** Líneas de protocolo emitidas hasta ahora (sin `|t:|`). */
  logLines: number;
  /** sha256 del log emitido, normalizado: detecta la deriva del motor (D3). */
  logHash: string | null;
  turn: number;
  status: 'ready' | 'active' | 'finished' | 'aborted';
  turnSeconds: number | null;
  /** Llega como `string` si el registro pasó por JSON; el reloj lo tolera. */
  deadlineAt: Date | null;
  winner: string | null;
  endType: 'normal' | 'forfeit' | 'tie' | null;
  endReason: string | null;
}

export type Action =
  | { type: 'choose'; side: Lado; seq: number; choice: string }
  | { type: 'undo'; side: Lado }
  | { type: 'forfeit'; side: Lado }
  | { type: 'timeout' };

export type CodigoError =
  | 'stale'
  | 'invalid_choice'
  | 'not_your_turn'
  | 'not_active'
  | 'not_expired'
  | 'engine_drift';

export type Transition =
  | {
      ok: true;
      record: BattleRecord;
      /** Líneas crudas de la tanda nueva (con `|split|`); `null` = no hubo tanda nueva. */
      newLines: string[] | null;
    }
  | {
      ok: false;
      code: CodigoError;
      detail: string;
      /** Presente si hay que persistir algo aun fallando (petición reemitida, batalla abortada). */
      record?: BattleRecord;
    };

/** Contexto inyectado: el núcleo no lee el reloj ni genera semillas. */
export interface Ctx {
  now: Date;
}
