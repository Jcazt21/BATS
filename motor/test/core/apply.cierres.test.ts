import { describe, expect, it } from 'vitest';

import { apply } from '../../src/core/apply.js';
import { start } from '../../src/core/start.js';
import type { BattleRecord, Lado } from '../../src/core/types.js';
import { doradas } from '../helpers/doradas.js';
import { AHORA, registroDe } from '../helpers/registro.js';

const d = doradas.find(x => x.requests)!;
const ctx = { now: AHORA };
const LIMITE = new Date(AHORA.getTime() + 150_000);

const inicio = (over: Partial<BattleRecord> = {}) =>
  start(registroDe(d, over), { seed: d.seed, now: AHORA }).record;
const elegir = (r: BattleRecord, side: Lado, choice: string) => apply(r, { type: 'choose', side, seq: r.seq, choice }, ctx);
const ok = (t: ReturnType<typeof apply>): BattleRecord => {
  if (!t.ok) throw new Error(`${t.code}: ${t.detail}`);
  return t.record;
};

// F1.5
describe('apply · deshacer', () => {
  it('retira la elección pendiente sin tocar el resto', () => {
    const r1 = ok(elegir(inicio(), 'p1', 'team 3, 2, 1, 4, 5, 6'));
    const t = apply(r1, { type: 'undo', side: 'p1' }, ctx);
    expect(t).toMatchObject({ ok: true, newLines: null });
    const r2 = ok(t);
    expect(r2.pending).toEqual({ p1: null, p2: null });
    expect({ ...r2, pending: r1.pending }).toEqual(r1);
  });

  it('sin elección pendiente responde `not_your_turn`', () => {
    expect(apply(inicio(), { type: 'undo', side: 'p1' }, ctx)).toMatchObject({ ok: false, code: 'not_your_turn' });
  });

  it('el rival no puede deshacer la elección de otro y, resuelto el turno, no hay nada que deshacer', () => {
    const r1 = ok(elegir(inicio(), 'p1', 'team 3, 2, 1, 4, 5, 6'));
    expect(apply(r1, { type: 'undo', side: 'p2' }, ctx)).toMatchObject({ ok: false, code: 'not_your_turn' });
    const r2 = ok(elegir(r1, 'p2', 'team 6, 2, 3, 4, 5, 1'));
    expect(apply(r2, { type: 'undo', side: 'p1' }, ctx)).toMatchObject({ ok: false, code: 'not_your_turn' });
  });
});

// F1.6
describe('apply · rendirse', () => {
  it('gana el rival, deja la batalla cerrada y añade el mensaje de Showdown', () => {
    const t = apply(inicio(), { type: 'forfeit', side: 'p1' }, ctx);
    if (!t.ok) throw new Error(t.detail);
    const r = t.record;

    expect(r).toMatchObject({
      status: 'finished',
      winner: d.p2,
      endType: 'forfeit',
      endReason: 'forfeit',
      requests: { p1: null, p2: null },
      deadlineAt: null,
    });
    expect(r.seq).toBe(2);
    expect(t.newLines).toContain(`|win|${d.p2}`);
    expect(t.newLines).toContain(`|-message|${d.p1} forfeited.`);
    expect(r.inputLog.at(-1)).toBe('>forcelose p1');
  });

  it('funciona aunque el otro lado ya tenga una elección pendiente', () => {
    const r1 = ok(elegir(inicio(), 'p2', 'team 6, 2, 3, 4, 5, 1'));
    const t = apply(r1, { type: 'forfeit', side: 'p1' }, ctx);
    const r = ok(t);
    expect(r).toMatchObject({ status: 'finished', winner: d.p2, endType: 'forfeit', pending: { p1: null, p2: null } });
  });

  it('una batalla ya rendida no acepta más acciones', () => {
    const r = ok(apply(inicio(), { type: 'forfeit', side: 'p2' }, ctx));
    const otra = apply(r, { type: 'forfeit', side: 'p1' }, ctx);
    expect(otra).toMatchObject({ ok: false, code: 'not_active' });
  });
});

// F1.7
describe('apply · timeout', () => {
  it('antes de la fecha límite no vence', () => {
    const justo = new Date(LIMITE.getTime() - 1);
    expect(apply(inicio(), { type: 'timeout' }, { now: justo })).toMatchObject({ ok: false, code: 'not_expired' });
  });

  it('vencida: pierde el único lado que falta por elegir', () => {
    const r1 = ok(elegir(inicio(), 'p1', 'team 3, 2, 1, 4, 5, 6'));
    const t = apply(r1, { type: 'timeout' }, { now: LIMITE });
    const r = ok(t);
    expect(r).toMatchObject({ status: 'finished', winner: d.p1, endType: 'forfeit', endReason: 'timeout' });
  });

  it('vencida y faltan los dos: empate', () => {
    const r = ok(apply(inicio(), { type: 'timeout' }, { now: new Date(LIMITE.getTime() + 5000) }));
    expect(r).toMatchObject({ status: 'finished', winner: null, endType: 'tie', endReason: 'timeout' });
    expect(r.inputLog.at(-1)).toBe('>forcetie');
  });

  it('sin reloj (turnSeconds=null) nunca vence', () => {
    const r = inicio({ turnSeconds: null });
    const lejos = new Date(AHORA.getTime() + 10 * 365 * 24 * 3600 * 1000);
    expect(apply(r, { type: 'timeout' }, { now: lejos })).toMatchObject({ ok: false, code: 'not_expired' });
  });

  it('tolera una fecha límite que pasó por JSON', () => {
    const r = JSON.parse(JSON.stringify(inicio())) as BattleRecord;
    expect(apply(r, { type: 'timeout' }, { now: LIMITE })).toMatchObject({ ok: true });
  });
});

// F1.9
describe('apply · deriva del motor', () => {
  const alterado = () => ({ ...inicio(), logHash: 'a'.repeat(64) });

  it('con el hash alterado aborta la batalla y lo dice', () => {
    const t = elegir(alterado(), 'p1', 'team 1, 2, 3, 4, 5, 6');
    expect(t).toMatchObject({ ok: false, code: 'engine_drift' });
    if (t.ok) return;
    expect(t.record).toMatchObject({
      status: 'aborted',
      endReason: 'engine_drift',
      requests: { p1: null, p2: null },
      deadlineAt: null,
      winner: null,
    });
  });

  it('también se detecta al rendirse o vencer', () => {
    expect(apply(alterado(), { type: 'forfeit', side: 'p1' }, ctx)).toMatchObject({ ok: false, code: 'engine_drift' });
    expect(apply(alterado(), { type: 'timeout' }, { now: LIMITE })).toMatchObject({ ok: false, code: 'engine_drift' });
  });

  it('una batalla abortada ya no acepta acciones', () => {
    const t = elegir(alterado(), 'p1', 'team 1, 2, 3, 4, 5, 6');
    const abortada = !t.ok && t.record!;
    expect(elegir(abortada as BattleRecord, 'p1', 'team 1')).toMatchObject({ ok: false, code: 'not_active' });
  });
});
