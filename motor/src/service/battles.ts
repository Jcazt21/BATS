import { randomBytes } from 'node:crypto';
import type pg from 'pg';

import { apply } from '../core/apply.js';
import { start } from '../core/start.js';
import type { Action, BattleRecord, CodigoError, Lado, Rol } from '../core/types.js';
import { requestFor, viewFor } from '../core/view.js';
import { cargarTandas, leerFila, saveTransition, withBattleLock, type Fila } from '../db/repo.js';
import { ENGINE_VERSION } from '../engine/sim.js';
import { HttpError } from '../http/errors.js';

/**
 * Casos de uso del motor: orquestan núcleo puro (`core/`) + repositorio (`db/`). No conocen HTTP
 * más que por `HttpError`. La identidad (`usuario`) ya viene verificada del JWT (I5).
 */

export type Reloj = () => Date;
const ahora: Reloj = () => new Date();

/** Lo que el cliente envía: el lado sale de la identidad, nunca del cuerpo (I5). */
export type AccionCliente =
  | { type: 'choose'; seq: number; choice: string }
  | { type: 'undo' }
  | { type: 'forfeit' }
  | { type: 'timeout' };

export interface Resultado {
  seq: number;
  resolved: boolean;
  /** La acción terminó la batalla: quien llama dispara la ingesta (F2.9). */
  finished: boolean;
}

export interface VistaHttp {
  id: number;
  kind: 'league' | 'sparring';
  status: Fila['estado'];
  p1: string;
  p2: string;
  you: Rol;
  seq: number;
  turn: number;
  updates: { seq: number; lines: string[] }[];
  request: unknown | null;
  chosen: boolean;
  deadlineAt: string | null;
  serverNow: string;
  winner: string | null;
  endType: BattleRecord['endType'];
  endReason: string | null;
}

/** Semilla secreta: `sodium,<hex>` (el formato que verificaron las doradas), con CSPRNG. */
export function nuevaSemilla(): string {
  return `sodium,${randomBytes(16).toString('hex')}`;
}

function rolDe(fila: Fila, usuario: string): Rol {
  const u = usuario.toLowerCase();
  return fila.p1 === u ? 'p1' : fila.p2 === u ? 'p2' : 'spectator';
}

const ESTADO_HTTP: Record<CodigoError, number> = {
  stale: 409,
  invalid_choice: 422,
  not_your_turn: 409,
  not_active: 409,
  not_expired: 409,
  engine_drift: 409,
};

/** Inicia la batalla si está `ready`, bajo bloqueo (idempotente: el segundo en llegar no hace nada). */
async function iniciarSiHaceFalta(pool: pg.Pool, id: number, reloj: Reloj): Promise<void> {
  await withBattleLock(pool, id, async (fila, tx) => {
    if (fila.estado !== 'ready' || !fila.record) return;
    const { record, newLines } = start(fila.record, { seed: nuevaSemilla(), now: reloj() });
    await saveTransition(tx, fila, record, newLines, { engineVersion: ENGINE_VERSION });
  });
}

/** `GET /battles/:id`: la vista de quien pregunta. Si la batalla está `ready`, la inicia. */
export async function obtenerVista(
  pool: pg.Pool,
  id: number,
  usuario: string,
  since: number,
  reloj: Reloj = ahora,
): Promise<VistaHttp> {
  let fila = await leerFila(pool, id);
  if (!fila) throw new HttpError(404, 'not_found', 'Batalla no encontrada');
  if (fila.estado === 'ready') {
    await iniciarSiHaceFalta(pool, id, reloj);
    fila = await leerFila(pool, id);
    if (!fila) throw new HttpError(404, 'not_found', 'Batalla no encontrada');
  }

  const rol = rolDe(fila, usuario);
  const record = fila.record;
  const tandas = record ? await cargarTandas(pool, id, since, record.seq) : [];
  return {
    id: fila.id,
    kind: fila.kind,
    status: fila.estado,
    p1: fila.p1,
    p2: fila.p2,
    you: rol,
    seq: record?.seq ?? 0,
    turn: record?.turn ?? 0,
    // Una tanda a la vez: `viewFor` filtra por canal y conserva el orden.
    updates: tandas.map(t => ({ seq: t.seq, lines: viewFor(rol, [t.lines])[0] })),
    request: record ? requestFor(record, rol) : null,
    chosen: record !== null && rol !== 'spectator' && record.pending[rol] !== null,
    deadlineAt: record?.deadlineAt ? record.deadlineAt.toISOString() : null,
    serverNow: reloj().toISOString(),
    winner: record?.winner ?? null,
    endType: record?.endType ?? null,
    endReason: record?.endReason ?? null,
  };
}

type Salida =
  | { ok: true; resultado: Resultado }
  | { ok: false; error: HttpError };

/** `choose` · `undo` · `forfeit` · `timeout`: aplica la acción bajo bloqueo y guarda el resultado. */
export async function accionar(
  pool: pg.Pool,
  id: number,
  usuario: string,
  accion: AccionCliente,
  reloj: Reloj = ahora,
): Promise<Resultado> {
  const salida = await withBattleLock<Salida>(pool, id, async (fila, tx) => {
    const rol = rolDe(fila, usuario);
    if (rol === 'spectator') {
      return { ok: false, error: new HttpError(403, 'forbidden', 'No participas en esta batalla') };
    }
    if (!fila.record || fila.estado !== 'active') {
      return { ok: false, error: new HttpError(409, 'not_active', `La batalla no está activa (${fila.estado}).`) };
    }
    const lado: Lado = rol;
    const orden: Action =
      accion.type === 'choose' ? { type: 'choose', side: lado, seq: accion.seq, choice: accion.choice }
      : accion.type === 'timeout' ? { type: 'timeout' }
      : { type: accion.type, side: lado };

    const t = apply(fila.record, orden, { now: reloj() });
    if (!t.ok) {
      // Hay que persistir algo aun fallando (petición reemitida, batalla abortada por deriva).
      if (t.record) await saveTransition(tx, fila, t.record, null);
      return { ok: false, error: new HttpError(ESTADO_HTTP[t.code], t.code, t.detail) };
    }
    if (t.record !== fila.record) await saveTransition(tx, fila, t.record, t.newLines);
    return {
      ok: true,
      resultado: { seq: t.record.seq, resolved: t.newLines !== null, finished: t.record.status === 'finished' },
    };
  });
  if (!salida) throw new HttpError(404, 'not_found', 'Batalla no encontrada');
  if (!salida.ok) throw salida.error;
  return salida.resultado;
}
