import { describe, expect, it } from 'vitest';

import { normalizeLog } from '../../src/core/hash.js';
import { replay } from '../../src/engine/replay.js';
import { extractChannelMessages } from '../../src/engine/sim.js';
import { doradas } from '../helpers/doradas.js';

const canal = (lineas: string[], n: -1 | 0 | 1 | 2) => extractChannelMessages(lineas.join('\n'), [n])[n];

// I3: con la versión fijada del motor, cada batalla dorada se reproduce idéntica.
describe.each(doradas)('rejugada dorada · $id', d => {
  it('da el mismo log normalizado, ganador y número de turnos', () => {
    const crudo: string[] = [];
    const battle = replay(d.inputLog, (tipo, datos) => {
      if (tipo === 'update') crudo.push(...datos.split('\n'));
    });

    expect(normalizeLog(crudo)).toEqual(d.log);
    expect(battle.ended).toBe(true);
    expect(battle.winner ?? '').toBe(d.winner);
    expect(battle.turn).toBe(d.turns);
  });

  it('las vistas guardadas salen de las tandas crudas', () => {
    expect(d.updates.flatMap(t => normalizeLog(t))).toEqual(d.log);
    expect(d.updates.map(t => canal(t, 1))).toEqual(d.viewP1);
    expect(d.updates.map(t => canal(t, 2))).toEqual(d.viewP2);
    expect(d.updates.map(t => canal(t, 0))).toEqual(d.viewSpectator);
  });
});

describe('normalizeLog', () => {
  it('resuelve los |split| a la vista omnisciente y quita el reloj', () => {
    const crudo = ['|t:|1775615862', '|split|p1', '|-damage|p1a: Ditto|150/300', '|-damage|p1a: Ditto|50/100', '|turn|2'];
    expect(normalizeLog(crudo)).toEqual(['|-damage|p1a: Ditto|150/300', '|turn|2']);
  });
});
