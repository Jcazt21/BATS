import { replayConColector, type Colector } from '../engine/replay.js';
import type { Battle } from '../engine/sim.js';
import { hashLog } from './hash.js';
import { haVencido, ladosPendientes, nuevaFecha, otroLado } from './timer.js';
import type { Action, BattleRecord, Ctx, Lado, Transition } from './types.js';

type Fallo = Extract<Transition, { ok: false }>;

type Reproduccion =
  | { ok: true; battle: Battle; colector: Colector }
  | { ok: false; fallo: Fallo };

function abortada(record: BattleRecord): BattleRecord {
  return {
    ...record,
    pending: { p1: null, p2: null },
    requests: { p1: null, p2: null },
    status: 'aborted',
    deadlineAt: null,
    winner: null,
    endType: null,
    endReason: 'engine_drift',
  };
}

/** Rejuega el `inputLog` y comprueba que sigue dando el log que se emitió (D3). */
function reproducir(record: BattleRecord): Reproduccion {
  const { battle, colector } = replayConColector(record.inputLog);
  if (colector.lines.length !== record.logLines || hashLog(colector.lines) !== record.logHash) {
    return {
      ok: false,
      fallo: {
        ok: false,
        code: 'engine_drift',
        detail: 'El simulador ya no reproduce el log emitido: batalla abortada.',
        record: abortada(record),
      },
    };
  }
  return { ok: true, battle, colector };
}

interface Cierre {
  endType: 'forfeit' | 'tie';
  endReason: string;
}

/** Registro tras una tanda nueva: el `inputLog` y las peticiones salen del simulador. */
function sellarTanda(record: BattleRecord, battle: Battle, colector: Colector, { now }: Ctx, cierre?: Cierre): Transition {
  const terminada = battle.ended;
  const ganador = battle.winner || null;
  return {
    ok: true,
    newLines: colector.lines.slice(record.logLines),
    record: {
      ...record,
      inputLog: [...battle.inputLog],
      pending: { p1: null, p2: null },
      requests: terminada ? { p1: null, p2: null } : { ...colector.requests },
      seq: record.seq + 1,
      logLines: colector.lines.length,
      logHash: hashLog(colector.lines),
      turn: battle.turn,
      status: terminada ? 'finished' : 'active',
      deadlineAt: terminada ? null : nuevaFecha(now, record.turnSeconds),
      winner: terminada ? ganador : null,
      endType: terminada ? (cierre?.endType ?? (ganador ? 'normal' : 'tie')) : null,
      endReason: terminada ? (cierre?.endReason ?? null) : null,
    },
  };
}

function elegir(record: BattleRecord, lado: Lado, choice: string, ctx: Ctx): Transition {
  const pendiente = record.pending[lado];
  if (pendiente !== null) {
    if (pendiente === choice) return { ok: true, record, newLines: null };
    return { ok: false, code: 'invalid_choice', detail: 'Ya elegiste en este turno: deshaz tu elección antes de cambiarla.' };
  }

  const r = reproducir(record);
  if (!r.ok) return r.fallo;
  const { battle, colector } = r;

  // La elección del rival entra primero: es la que ya estaba esperando.
  const rival = otroLado(lado);
  const delRival = record.pending[rival];
  if (delRival !== null && !battle.choose(rival, delRival)) {
    return { ok: false, code: 'engine_drift', detail: `La elección pendiente de ${rival} dejó de ser válida.`, record: abortada(record) };
  }
  colector.reiniciarCambios();
  const valida = battle.choose(lado, choice);
  battle.sendUpdates();

  if (!valida) {
    const detail = colector.errores.at(-1)?.texto ?? `Elección inválida: ${choice}`;
    return {
      ok: false,
      code: 'invalid_choice',
      detail,
      // El simulador a veces revela algo al rechazar (p. ej. que estás atrapado): se conserva.
      record: colector.reemitidas.size > 0 ? { ...record, requests: { ...colector.requests } } : undefined,
    };
  }

  if (battle.inputLog.length > record.inputLog.length) return sellarTanda(record, battle, colector, ctx);
  return { ok: true, record: { ...record, pending: { ...record.pending, [lado]: choice } }, newLines: null };
}

function deshacer(record: BattleRecord, lado: Lado): Transition {
  if (record.pending[lado] === null) {
    return { ok: false, code: 'not_your_turn', detail: 'No tienes ninguna elección pendiente que deshacer.' };
  }
  return { ok: true, newLines: null, record: { ...record, pending: { ...record.pending, [lado]: null } } };
}

/**
 * El lado `perdedor` pierde. Las elecciones pendientes se descartan: nunca llegaron al simulador.
 * `|-message|` lo añade Showdown, no el simulador; se replica para que el log coincida con los de PS.
 */
function perder(record: BattleRecord, perdedor: Lado, motivo: 'forfeit' | 'timeout', ctx: Ctx): Transition {
  const r = reproducir(record);
  if (!r.ok) return r.fallo;
  const { battle, colector } = r;

  battle.lose(perdedor);
  battle.inputLog.push(`>forcelose ${perdedor}`); // `lose` no lo apunta; el replay lo necesita
  battle.sendUpdates();
  const nombre = record[perdedor].name;
  colector.lines.push(motivo === 'forfeit' ? `|-message|${nombre} forfeited.` : `|-message|${nombre} lost due to inactivity.`);
  return sellarTanda(record, battle, colector, ctx, { endType: 'forfeit', endReason: motivo });
}

function empatar(record: BattleRecord, ctx: Ctx): Transition {
  const r = reproducir(record);
  if (!r.ok) return r.fallo;
  r.battle.forceWin(null); // apunta `>forcetie`
  r.battle.sendUpdates();
  return sellarTanda(record, r.battle, r.colector, ctx, { endType: 'tie', endReason: 'timeout' });
}

function vencer(record: BattleRecord, ctx: Ctx): Transition {
  if (!haVencido(record, ctx)) {
    return { ok: false, code: 'not_expired', detail: 'La fecha límite de esta decisión no ha vencido.' };
  }
  const faltan = ladosPendientes(record);
  if (faltan.length === 1) return perder(record, faltan[0], 'timeout', ctx);
  if (faltan.length === 2) return empatar(record, ctx);
  return { ok: false, code: 'not_expired', detail: 'Nadie debe elegir ahora.' };
}

/**
 * Aplica una acción a una batalla. Sin IO: el reloj llega en `ctx`. No muta `record`: devuelve
 * uno nuevo (o el mismo, si la acción no cambia nada).
 */
export function apply(record: BattleRecord, action: Action, ctx: Ctx): Transition {
  if (record.status !== 'active') {
    return { ok: false, code: 'not_active', detail: `La batalla no está activa (${record.status}).` };
  }
  switch (action.type) {
    case 'choose':
      if (action.seq !== record.seq) {
        return { ok: false, code: 'stale', detail: `Tanda ${action.seq} desfasada; la actual es ${record.seq}.` };
      }
      return elegir(record, action.side, action.choice, ctx);
    case 'undo':
      return deshacer(record, action.side);
    case 'forfeit':
      return perder(record, action.side, 'forfeit', ctx);
    case 'timeout':
      return vencer(record, ctx);
  }
}
