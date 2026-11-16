import { describe, expect, it } from 'vitest';

import { Dex, Teams } from '../src/engine/sim.js';
import { doradas } from './helpers/doradas.js';

const ANONIMO = /^jugador\d+$/;
/** Chat, entradas/salidas y reloj: nada de eso debe llegar a una fixture. */
const PROHIBIDAS = /^\|(c|c:|j|l|n|t:)\|/;

const opcionesDe = (linea: string) => JSON.parse(linea.slice(linea.indexOf('{'))) as Record<string, string>;
const especieBase = (especie: string) => Dex.species.get(especie).baseSpecies;

describe('fixtures doradas', () => {
  it('hay doradas y se llaman dorada-NN', () => {
    expect(doradas.length).toBeGreaterThanOrEqual(13);
    doradas.forEach((d, i) => expect(d.id).toBe(`dorada-${String(i + 1).padStart(2, '0')}`));
  });

  describe.each(doradas)('$id', d => {
    it('cumple el esquema', () => {
      expect(d.rules).toMatch(/^gen9nationaldexag@@@/);
      expect(d.formatId).toMatch(/^gen9(pinchesgueysleague|pglsparring)$/);
      expect(typeof d.seed).toBe('string');
      expect(d.turns).toBeGreaterThanOrEqual(3);
      expect(['normal', 'forfeit', 'tie']).toContain(d.endType);
      expect(d.p1team).toHaveLength(6);
      expect(d.p2team).toHaveLength(6);
      expect(d.log.length).toBeGreaterThan(0);

      expect(d.inputLog[0]).toMatch(/^>start /);
      expect(opcionesDe(d.inputLog[0])).toMatchObject({ formatid: d.rules, seed: d.seed });
      expect(d.inputLog[1]).toMatch(/^>player p1 /);
      expect(d.inputLog[2]).toMatch(/^>player p2 /);
    });

    it('las vistas tienen una entrada por tanda', () => {
      expect(d.updates.length).toBeGreaterThan(2);
      for (const vista of [d.viewP1, d.viewP2, d.viewSpectator]) expect(vista).toHaveLength(d.updates.length);
      if (d.requests) expect(d.requests).toHaveLength(d.updates.length);
    });

    it('no contiene chat, entradas ni reloj', () => {
      const lineas = [d.log, ...d.updates, ...d.viewP1, ...d.viewP2, ...d.viewSpectator].flat();
      expect(lineas.filter(l => PROHIBIDAS.test(l))).toEqual([]);
    });

    it('está anonimizada', () => {
      expect(d.p1).toMatch(ANONIMO);
      expect(d.p2).toMatch(ANONIMO);
      expect(d.p1).not.toBe(d.p2);
      if (d.winner) expect([d.p1, d.p2]).toContain(d.winner);

      for (const [i, nombre] of [[1, d.p1], [2, d.p2]] as const) {
        const opciones = opcionesDe(d.inputLog[i]);
        // Solo nombre y equipo: ni avatar ni rating.
        expect(Object.keys(opciones).sort()).toEqual(['name', 'team']);
        expect(opciones.name).toBe(nombre);
        for (const set of Teams.unpack(opciones.team)!) expect(set.name).toBe(especieBase(set.species));
      }
      for (const set of [...d.p1team, ...d.p2team]) expect(set.name).toBe(especieBase(set.species));
      // `|player|pN|<nombre>|<avatar>|<rating>`: sin avatar ni rating.
      const jugadores = d.log.filter(l => l.startsWith('|player|'));
      expect(jugadores).toEqual([`|player|p1|${d.p1}||`, `|player|p2|${d.p2}||`]);
    });
  });

  it('solo una dorada guarda las peticiones (pesan demasiado para repetirlas)', () => {
    expect(doradas.filter(d => d.requests)).toHaveLength(1);
  });
});
