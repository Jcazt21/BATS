import { describe, expect, it } from 'vitest';

import { apply } from '../../src/core/apply.js';
import { start } from '../../src/core/start.js';
import { requestFor, viewFor, vistaDe } from '../../src/core/view.js';
import { extractChannelMessages } from '../../src/engine/sim.js';
import { doradas } from '../helpers/doradas.js';
import { jugarDorada } from '../helpers/jugar.js';
import { AHORA, registroDe } from '../helpers/registro.js';

// I1 · F1.8
const d = doradas.find(x => x.requests)!;
const { record, tandas } = jugarDorada(d);
const canal = (n: 1 | 2) => d[n === 1 ? 'viewP1' : 'viewP2'].flat();

describe('viewFor', () => {
  it('cada rol ve exactamente su canal de la dorada', () => {
    expect(viewFor('p1', tandas).flat()).toEqual(d.viewP1.flat());
    expect(viewFor('p2', tandas).flat()).toEqual(d.viewP2.flat());
    expect(viewFor('spectator', tandas).flat()).toEqual(d.viewSpectator.flat());
  });

  it('conserva la separación en tandas', () => {
    expect(viewFor('p2', tandas)).toHaveLength(tandas.length);
  });

  it('p2 no ve ninguna línea que solo exista en el canal de p1', () => {
    const soloP1 = canal(1).filter(l => !canal(2).includes(l) && !d.viewSpectator.flat().includes(l));
    expect(soloP1.length).toBeGreaterThan(0); // la prueba no es vacía
    const vistaP2 = viewFor('p2', tandas).flat();
    for (const linea of soloP1) expect(vistaP2).not.toContain(linea);

    const soloP2 = canal(2).filter(l => !canal(1).includes(l) && !d.viewSpectator.flat().includes(l));
    const vistaP1 = viewFor('p1', tandas).flat();
    for (const linea of soloP2) expect(vistaP1).not.toContain(linea);
  });

  it('el espectador no ve información secreta de ninguno', () => {
    const vista = viewFor('spectator', tandas).flat();
    const secretas = [...canal(1), ...canal(2)].filter(l => !d.viewSpectator.flat().includes(l));
    for (const linea of secretas) expect(vista).not.toContain(linea);
    // y coincide con el canal 0 del simulador
    expect(vista).toEqual(tandas.flatMap(t => extractChannelMessages(t.join('\n'), [0])[0]));
  });
});

describe('requestFor', () => {
  const vivo = () => {
    const r0 = start(registroDe(d), { seed: d.seed, now: AHORA }).record;
    return r0;
  };

  it('cada lado recibe solo su petición y el espectador ninguna', () => {
    const r = vivo();
    const p1 = requestFor(r, 'p1') as { side: { id: string } };
    const p2 = requestFor(r, 'p2') as { side: { id: string } };
    expect(p1.side.id).toBe('p1');
    expect(p2.side.id).toBe('p2');
    expect(requestFor(r, 'spectator')).toBeNull();
  });

  it('no hay petición una vez terminada la batalla', () => {
    expect(requestFor(record, 'p1')).toBeNull();
    expect(requestFor(record, 'p2')).toBeNull();
  });
});

describe('vistaDe (lo que sale por HTTP)', () => {
  const r0 = start(registroDe(d), { seed: d.seed, now: AHORA });
  const conPendiente = apply(r0.record, { type: 'choose', side: 'p1', seq: 1, choice: 'team 6, 5, 4, 3, 2, 1' }, { now: AHORA });
  if (!conPendiente.ok) throw new Error(conPendiente.detail);
  const r = conPendiente.record;

  it('no contiene semilla, inputLog, elección pendiente, equipos ni la petición del rival', () => {
    const json = JSON.stringify(vistaDe(r, 'p2', [r0.newLines]));
    expect(json).not.toContain(d.seed);
    expect(json).not.toContain('"inputLog"');
    expect(json).not.toContain('"pending"');
    expect(json).not.toContain('"seed"');
    expect(json).not.toContain('team 6, 5, 4, 3, 2, 1');
    expect(json).not.toContain('"team"');
    expect(json).not.toContain(r.inputLog[1]); // la línea `>player p1 {…}` lleva el equipo empacado
    expect(json).not.toContain('"id":"p1"'); // la petición de p1
  });

  it('cada jugador sabe si ya eligió, sin saber qué', () => {
    expect(vistaDe(r, 'p1', [r0.newLines])).toMatchObject({ chosen: true, role: 'p1' });
    expect(vistaDe(r, 'p2', [r0.newLines])).toMatchObject({ chosen: false });
    expect(vistaDe(r, 'spectator', [r0.newLines])).toMatchObject({ chosen: false, request: null });
  });

  it('expone el estado público de la batalla', () => {
    expect(vistaDe(record, 'spectator', tandas)).toMatchObject({
      status: 'finished',
      seq: record.seq,
      turn: record.turn,
      winner: d.winner,
      endType: 'normal',
      players: { p1: d.p1, p2: d.p2 },
    });
  });
});
