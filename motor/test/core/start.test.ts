import { describe, expect, it } from 'vitest';

import { hashLog } from '../../src/core/hash.js';
import { start } from '../../src/core/start.js';
import { doradas } from '../helpers/doradas.js';
import { AHORA, registroDe } from '../helpers/registro.js';

const d = doradas[0];

// F1.1
describe('start', () => {
  const ctx = { seed: d.seed, now: AHORA };

  it('deja la batalla activa en la tanda 1, con peticiones, hash y fecha límite', () => {
    const { record, newLines } = start(registroDe(d), ctx);

    expect(record.status).toBe('active');
    expect(record.seq).toBe(1);
    expect(record.seed).toBe(d.seed);
    expect(newLines).toContain('|teampreview');
    expect(record.logLines).toBe(newLines.length);
    expect(record.logHash).toBe(hashLog(newLines));
    expect(record.deadlineAt).toEqual(new Date(AHORA.getTime() + 150_000));
    expect(record.pending).toEqual({ p1: null, p2: null });
    for (const lado of ['p1', 'p2'] as const) {
      expect(record.requests[lado]).toMatchObject({ teamPreview: true });
    }
    expect(record.inputLog[0]).toContain(`"seed":"${d.seed}"`);
    expect(record.inputLog.slice(1).map(l => l.split(' ').slice(0, 2).join(' '))).toEqual(['>player p1', '>player p2']);
  });

  it('con la misma semilla da exactamente el mismo resultado', () => {
    expect(start(registroDe(d), ctx)).toEqual(start(registroDe(d), ctx));
  });

  it('con otra semilla el inputLog cambia', () => {
    const otra = start(registroDe(d), { ...ctx, seed: 'sodium,00000000000000000000000000000001' });
    expect(otra.record.inputLog).not.toEqual(start(registroDe(d), ctx).record.inputLog);
  });

  it('sin reloj (turnSeconds=null) no hay fecha límite', () => {
    expect(start(registroDe(d, { turnSeconds: null }), ctx).record.deadlineAt).toBeNull();
  });

  it('no muta el registro que recibe y exige que esté en `ready`', () => {
    const antes = registroDe(d);
    const copia = structuredClone(antes);
    start(antes, ctx);
    expect(antes).toEqual(copia);
    expect(() => start({ ...antes, status: 'active' }, ctx)).toThrow(/ready/);
  });
});
