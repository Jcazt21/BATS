import { describe, expect, it } from 'vitest';

import { normalizeLog } from '../../src/core/hash.js';
import { jugarAlAzar, jugarContinua } from '../helpers/azar.js';

// I2 · F1.10: aplicar las acciones de una en una desde la fila persistida (JSON) da el mismo log
// que una batalla continua en memoria.
//
// Cada paso rejuega la batalla entera (D2), así que 200 batallas tardan ~6 min en un portátil:
// en la corrida normal van 10 y la puerta de la fase usa `MOTOR_PROPIEDAD=200 npm run motor:test`.
const BATALLAS = Number(process.env.MOTOR_PROPIEDAD ?? 10);

describe('sin estado = continuo', () => {
  it(`${BATALLAS} batallas con semillas fijas`, () => {
    const turnos: number[] = [];
    for (let semilla = 1; semilla <= BATALLAS; semilla++) {
      const partida = jugarAlAzar(semilla);
      const continua = jugarContinua(partida);

      expect(partida.record.status, `semilla ${semilla}`).toBe('finished');
      expect(normalizeLog(partida.lineas), `log, semilla ${semilla}`).toEqual(continua.log);
      expect(partida.lineas.length, `líneas, semilla ${semilla}`).toBe(continua.lineas.length);
      expect(partida.record.inputLog, `inputLog, semilla ${semilla}`).toEqual(continua.battle.inputLog);
      expect(partida.record.turn).toBe(continua.battle.turn);
      expect(partida.record.winner).toBe(continua.battle.winner || null);
      turnos.push(partida.record.turn);
    }
    // La prueba no es trivial: hay batallas largas y de todo tipo.
    expect(Math.max(...turnos)).toBeGreaterThan(15);
  }, BATALLAS * 4000 + 30_000);
});
