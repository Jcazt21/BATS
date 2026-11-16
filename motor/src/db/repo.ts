import type pg from 'pg';

import type { BattleRecord } from '../core/types.js';
import type { PokemonSet } from '../engine/sim.js';
import { HttpError } from '../http/errors.js';

/**
 * Única capa que habla SQL con `arena.*` (decisión D7): bloqueo de la fila con `FOR UPDATE`,
 * mapeo fila ↔ `BattleRecord` en un solo sitio y guardado de cada transición.
 */

export type Tx = pg.PoolClient;
export type Consulta = Pick<pg.Pool, 'query'>;
export type EstadoDb = 'team_select' | 'ready' | 'active' | 'finished' | 'aborted';

/** Lo que el motor sabe de una batalla: el registro del núcleo más los datos que solo usa el HTTP. */
export interface Fila {
  id: number;
  seasonId: number;
  kind: 'league' | 'sparring';
  isTest: boolean;
  formatId: string;
  estado: EstadoDb;
  ingestStatus: string;
  /** Nombres de usuario en minúsculas (identidad de cada lado). */
  p1: string;
  p2: string;
  /** `null` mientras la batalla está en `team_select` (aún no hay equipos). */
  record: BattleRecord | null;
}

type FilaSql = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const fecha = (valor: unknown): Date | null => (valor == null ? null : new Date(valor as string | Date));

/** Fila de `arena.battles` → `Fila`. Único sitio donde se interpretan las columnas. */
export function filaDesdeSql(r: FilaSql): Fila {
  const estado = r.status as EstadoDb;
  const record: BattleRecord | null =
    estado === 'team_select'
      ? null
      : {
          rules: r.rules,
          seed: r.seed,
          p1: { name: r.p1, team: (r.p1_team ?? []) as PokemonSet[] },
          p2: { name: r.p2, team: (r.p2_team ?? []) as PokemonSet[] },
          inputLog: r.input_log,
          pending: { p1: r.p1_choice, p2: r.p2_choice },
          requests: { p1: r.p1_request, p2: r.p2_request },
          seq: r.seq,
          logLines: r.log_lines,
          logHash: r.log_hash,
          turn: r.turn,
          status: estado,
          turnSeconds: r.turn_seconds,
          deadlineAt: fecha(r.deadline_at),
          winner: r.winner,
          endType: r.end_type,
          endReason: r.end_reason,
        };
  return {
    id: Number(r.battle_id),
    seasonId: r.season_id,
    kind: r.kind,
    isTest: r.is_test,
    formatId: r.format_id,
    estado,
    ingestStatus: r.ingest_status,
    p1: r.p1,
    p2: r.p2,
    record,
  };
}

const json = (valor: unknown): string | null => (valor == null ? null : JSON.stringify(valor));

/** Lectura sin bloqueo (GET). */
export async function leerFila(db: Consulta, id: number): Promise<Fila | null> {
  const { rows } = await db.query('SELECT * FROM arena.battles WHERE battle_id = $1', [id]);
  return rows[0] ? filaDesdeSql(rows[0]) : null;
}

/**
 * Transacción corta con la fila bloqueada. Commit al volver; rollback si `fn` lanza (la tanda no
 * queda a medias). `null` si la batalla no existe. Si otra conexión tiene el bloqueo más de 3 s
 * responde `503 busy` (reintentable) en vez de colgarse.
 */
export async function withBattleLock<T>(
  pool: pg.Pool,
  id: number,
  fn: (fila: Fila, tx: Tx) => Promise<T>,
): Promise<T | null> {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query("SET LOCAL lock_timeout = '3s'");
    await tx.query("SET LOCAL statement_timeout = '8s'");
    const { rows } = await tx.query('SELECT * FROM arena.battles WHERE battle_id = $1 FOR UPDATE', [id]);
    if (!rows[0]) {
      await tx.query('ROLLBACK');
      return null;
    }
    const resultado = await fn(filaDesdeSql(rows[0]), tx);
    await tx.query('COMMIT');
    return resultado;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => {});
    if ((error as { code?: string }).code === '55P03') {
      throw new HttpError(503, 'busy', 'La batalla está ocupada; reintenta en un momento.');
    }
    throw error;
  } finally {
    tx.release();
  }
}

/**
 * Guarda una transición en la misma transacción: la tanda nueva, la fila y el aviso de Realtime.
 * Al pasar a `finished` deja la ingesta en `pending` (o `skipped` si es de prueba).
 */
export async function saveTransition(
  tx: Tx,
  fila: Fila,
  record: BattleRecord,
  newLines: string[] | null,
  opciones: { engineVersion?: string } = {},
): Promise<void> {
  if (newLines) {
    await tx.query('INSERT INTO arena.battle_updates (battle_id, seq, lines) VALUES ($1, $2, $3)', [
      fila.id,
      record.seq,
      newLines,
    ]);
  }
  await tx.query(
    `UPDATE arena.battles SET
       engine_version = COALESCE($2::text, engine_version),
       status = $3::text, seed = $4, input_log = $5,
       p1_choice = $6, p2_choice = $7, p1_request = $8::jsonb, p2_request = $9::jsonb,
       seq = $10, log_lines = $11, log_hash = $12, turn = $13,
       deadline_at = $14, winner = $15, end_type = $16, end_reason = $17,
       started_at  = CASE WHEN $3::text = 'active' THEN COALESCE(started_at, now()) ELSE started_at END,
       finished_at = CASE WHEN $3::text IN ('finished', 'aborted') THEN COALESCE(finished_at, now()) ELSE finished_at END,
       ingest_status = CASE WHEN $3::text = 'finished' AND ingest_status = 'none'
                            THEN CASE WHEN is_test THEN 'skipped' ELSE 'pending' END
                            ELSE ingest_status END,
       updated_at = now()
     WHERE battle_id = $1`,
    [
      fila.id,
      opciones.engineVersion ?? null,
      record.status,
      record.seed,
      record.inputLog,
      record.pending.p1,
      record.pending.p2,
      json(record.requests.p1),
      json(record.requests.p2),
      record.seq,
      record.logLines,
      record.logHash,
      record.turn,
      record.deadlineAt,
      record.winner,
      record.endType,
      record.endReason,
    ],
  );
  await tx.query('SELECT arena.notify($1, $2, $3::jsonb)', [`battle:${fila.id}`, 'update', JSON.stringify({ seq: record.seq })]);
}

/** Tandas con `desde < seq <= hasta`, en orden. */
export async function cargarTandas(
  db: Consulta,
  id: number,
  desde: number,
  hasta: number,
): Promise<{ seq: number; lines: string[] }[]> {
  const { rows } = await db.query(
    'SELECT seq, lines FROM arena.battle_updates WHERE battle_id = $1 AND seq > $2 AND seq <= $3 ORDER BY seq',
    [id, desde, hasta],
  );
  return rows.map(r => ({ seq: r.seq, lines: r.lines }));
}
