import { describe, expect, it } from 'vitest';

import { checkFormat, validateTeam } from '../../src/engine/format.js';
import type { PokemonSet } from '../../src/engine/sim.js';
import { doradas } from '../helpers/doradas.js';

// F1.11
const d = doradas[0];
const equipos = doradas.flatMap(x => [x.p1team, x.p2team] as unknown as PokemonSet[][]);
// Varios equipos reales de la liga incumplen la Item Clause o la de un solo restringido con las
// reglas del apéndice A del plan (se anota en la bitácora); los casos se parten de uno legal.
const legal = equipos.find(e => validateTeam(d.rules, e).length === 0)!;
const equipo = (): PokemonSet[] => structuredClone(legal);

describe('checkFormat', () => {
  it('acepta la cadena de reglas de liga', () => {
    expect(checkFormat(d.rules)).toEqual([]);
  });

  it('rechaza una cadena inválida con un mensaje claro', () => {
    const errores = checkFormat('gen9nationaldexag@@@ReglaQueNoExiste');
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatch(/formato/i);
    expect(checkFormat('formatoquenoexiste')[0]).toMatch(/formato/i);
  });
});

describe('validateTeam', () => {
  it('un equipo legal no da errores (y hay equipos reales que lo son)', () => {
    expect(legal).toBeDefined();
    expect(validateTeam(d.rules, equipo())).toEqual([]);
  });

  it('un movimiento que la especie no puede aprender es un error', () => {
    const t = equipo();
    t[0].moves = ['Spore', ...t[0].moves.slice(1)];
    const errores = validateTeam(d.rules, t);
    expect(errores.join(' ')).toMatch(/spore/i);
  });

  it('un objeto repetido rompe la Item Clause', () => {
    const t = equipo();
    t[1].item = t[0].item;
    expect(validateTeam(d.rules, t).join(' ')).toMatch(/item clause|more than one/i);
  });

  it('una especie vetada con `-Especie` es un error', () => {
    const errores = validateTeam(`${d.rules},-${legal[0].species}`, equipo());
    expect(errores.join(' ')).toMatch(new RegExp(legal[0].species, 'i'));
  });

  it('con una cadena de formato inválida devuelve el error de formato, sin lanzar', () => {
    expect(validateTeam('formatoquenoexiste', equipo())[0]).toMatch(/formato/i);
  });
});
