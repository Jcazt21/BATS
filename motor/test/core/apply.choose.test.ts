import { describe, expect, it } from 'vitest';

import { apply } from '../../src/core/apply.js';
import { normalizeLog } from '../../src/core/hash.js';
import { start } from '../../src/core/start.js';
import type { BattleRecord, Lado } from '../../src/core/types.js';
import { doradas } from '../helpers/doradas.js';
import { eleccionesDe, jugarDorada } from '../helpers/jugar.js';
import { AHORA, registroDe } from '../helpers/registro.js';

const ctx = { now: AHORA };
const d = doradas.find(x => x.requests)!;

const elegir = (r: BattleRecord, side: Lado, choice: string, seq = r.seq) =>
  apply(r, { type: 'choose', side, seq, choice }, ctx);

function arranque(): BattleRecord {
  return start(registroDe(d), { seed: d.seed, now: AHORA }).record;
}

/** Avanza la dorada elección a elección hasta que `parar` sea cierto (sin aplicar esa elección). */
function avanzarHasta(parar: (r: BattleRecord) => boolean): BattleRecord {
  let r = arranque();
  for (const { side, choice } of eleccionesDe(d)) {
    if (parar(r)) return r;
    const t = elegir(r, side, choice);
    if (!t.ok) throw new Error(t.detail);
    r = t.record;
  }
  throw new Error('la condición nunca se cumplió');
}

const pidioCambio = (r: BattleRecord) =>
  [r.requests.p1, r.requests.p2].some(q => (q as { forceSwitch?: unknown } | null)?.forceSwitch);

// F1.2
describe('apply · elegir', () => {
  it('(a) el primer lado en elegir queda pendiente sin tocar el simulador', () => {
    const r0 = arranque();
    const t = elegir(r0, 'p1', 'team 3, 2, 1, 4, 5, 6');
    expect(t).toMatchObject({ ok: true, newLines: null });
    if (!t.ok) return;
    expect(t.record.pending).toEqual({ p1: 'team 3, 2, 1, 4, 5, 6', p2: null });
    expect(t.record.seq).toBe(r0.seq);
    expect(t.record.inputLog).toEqual(r0.inputLog);
  });

  it('(b) el segundo lado resuelve el turno', () => {
    const r0 = arranque();
    const p1 = elegir(r0, 'p1', 'team 3, 2, 1, 4, 5, 6');
    if (!p1.ok) throw new Error(p1.detail);
    const t = elegir(p1.record, 'p2', 'team 6, 2, 3, 4, 5, 1');
    if (!t.ok) throw new Error(t.detail);

    expect(t.record.seq).toBe(r0.seq + 1);
    expect(t.record.pending).toEqual({ p1: null, p2: null });
    expect(t.record.inputLog.length).toBe(r0.inputLog.length + 2);
    expect(t.newLines).not.toBeNull();
    expect(t.newLines!.some(l => l.startsWith('|turn|1'))).toBe(true);
    expect(t.record.turn).toBe(1);
    expect(t.record.requests.p1).toMatchObject({ active: expect.any(Array) });
    expect(t.record.logLines).toBe(r0.logLines + t.newLines!.length);
    expect(t.record.deadlineAt).toEqual(new Date(AHORA.getTime() + 150_000));
  });

  it('(c) un seq viejo es `stale` y no cambia nada', () => {
    const r0 = arranque();
    const copia = structuredClone(r0);
    const t = elegir(r0, 'p1', 'team 1, 2, 3, 4, 5, 6', r0.seq - 1);
    expect(t).toMatchObject({ ok: false, code: 'stale' });
    expect(r0).toEqual(copia);
  });

  it('(d) repetir la misma elección pendiente es idempotente', () => {
    const p1 = elegir(arranque(), 'p1', 'team 3, 2, 1, 4, 5, 6');
    if (!p1.ok) throw new Error(p1.detail);
    const otra = elegir(p1.record, 'p1', 'team 3, 2, 1, 4, 5, 6');
    expect(otra).toMatchObject({ ok: true, newLines: null });
    if (otra.ok) expect(otra.record).toEqual(p1.record);
  });

  it('cambiar la elección pendiente sin deshacer se rechaza', () => {
    const p1 = elegir(arranque(), 'p1', 'team 3, 2, 1, 4, 5, 6');
    if (!p1.ok) throw new Error(p1.detail);
    expect(elegir(p1.record, 'p1', 'team 1, 2, 3, 4, 5, 6')).toMatchObject({ ok: false, code: 'invalid_choice' });
  });

  it('no muta el registro que recibe', () => {
    const r0 = arranque();
    const copia = structuredClone(r0);
    elegir(r0, 'p1', 'team 3, 2, 1, 4, 5, 6');
    expect(r0).toEqual(copia);
  });

  it('una batalla que no está activa responde `not_active`', () => {
    expect(elegir(registroDe(d), 'p1', 'team 1', 0)).toMatchObject({ ok: false, code: 'not_active' });
  });
});

// F1.3
describe('apply · elecciones inválidas', () => {
  const enTurno1 = () => avanzarHasta(r => r.turn === 1);

  it('en team preview un movimiento es inválido y no deja rastro', () => {
    const t = elegir(arranque(), 'p1', 'move 1');
    expect(t).toMatchObject({ ok: false, code: 'invalid_choice' });
    expect(t.ok ? '' : t.detail).toMatch(/invalid choice/i);
    expect(t.ok ? null : t.record).toBeUndefined();
  });

  it('un movimiento inexistente o un cambio al mismo Pokémon activo es inválido', () => {
    const r = enTurno1();
    expect(elegir(r, 'p1', 'move 9')).toMatchObject({ ok: false, code: 'invalid_choice' });
    expect(elegir(r, 'p1', 'move noexiste')).toMatchObject({ ok: false, code: 'invalid_choice' });
    expect(elegir(r, 'p1', 'switch 1')).toMatchObject({ ok: false, code: 'invalid_choice' });
  });

  it('elegir sin petición (wait) y cambiar a un debilitado son inválidos', () => {
    const r = avanzarHasta(pidioCambio);
    const quien: Lado = (r.requests.p1 as { forceSwitch?: unknown }).forceSwitch ? 'p1' : 'p2';
    const rival: Lado = quien === 'p1' ? 'p2' : 'p1';
    expect(r.requests[rival]).toMatchObject({ wait: true });

    expect(elegir(r, rival, 'move 1')).toMatchObject({ ok: false, code: 'invalid_choice' });

    const pokemon = (r.requests[quien] as { side: { pokemon: { condition: string }[] } }).side.pokemon;
    const caido = pokemon.findIndex(p => p.condition.endsWith(' fnt')) + 1;
    expect(caido).toBeGreaterThan(0);
    expect(elegir(r, quien, `switch ${caido}`)).toMatchObject({ ok: false, code: 'invalid_choice' });
  });
});

// F1.4: las 13 batallas reales jugadas elección a elección, siempre desde el registro anterior.
describe.each(doradas)('apply · protocolo completo · $id', dorada => {
  const rendicion = dorada.endType === 'forfeit';

  it('reproduce el log, el ganador y los turnos de la dorada', () => {
    const { record, tandas } = jugarDorada(dorada);
    const log = normalizeLog(tandas.flat());

    if (rendicion) {
      // La dorada de rendición termina por `>forcelose`, que no es una elección.
      expect(log).toEqual(dorada.log.slice(0, log.length));
      expect(record.status).toBe('active');
    } else {
      expect(log).toEqual(dorada.log);
      expect(record.turn).toBe(dorada.turns);
      expect(record.status).toBe('finished');
      expect(record.winner).toBe(dorada.winner);
      expect(record.endType).toBe('normal');
      expect(record.requests).toEqual({ p1: null, p2: null });
      expect(record.deadlineAt).toBeNull();
    }
  });
});

describe('apply · casos de protocolo en las doradas', () => {
  const pasos = doradas.flatMap(dd => jugarDorada(dd).pasos.map(p => ({ id: dd.id, ...p })));

  it('hay teracristalización', () => {
    expect(pasos.some(p => p.choice.includes('terastallize') && p.resultado.ok)).toBe(true);
  });

  it('hay cambios forzados que una sola elección resuelve', () => {
    const forzados = pasos.filter(
      p => p.resultado.ok && p.resultado.newLines && p.choice.startsWith('switch') && p.resultado.record.pending.p1 === null,
    );
    expect(forzados.length).toBeGreaterThan(0);
  });
});
