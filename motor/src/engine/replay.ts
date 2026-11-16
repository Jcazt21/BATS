import { Battle } from './sim.js';

type Lado = 'p1' | 'p2';

/**
 * Lo que emite el simulador mientras se rejuega:
 *   - `update`: líneas nuevas del log, con marcadores `|split|`.
 *   - `sideupdate`: `pN\n|request|{…}` (petición de un lado) o `pN\n|error|…` (elección rechazada).
 *   - `end`: resumen final en JSON.
 */
export type OnSend = (type: string, data: string) => void;

/**
 * Rejuega una batalla entera desde su `inputLog` (decisión D2): la primera línea es
 * `>start {formatid, seed}` y el resto, las entradas en el orden en que se resolvieron.
 * Devuelve la `Battle` en el estado final.
 */
export function replay(inputLog: string[], onSend: OnSend): Battle {
  const start = JSON.parse(inputLog[0].slice('>start '.length));
  const battle = new Battle({
    ...start,
    send: (type: string, data: string | string[]) => onSend(type, Array.isArray(data) ? data.join('\n') : data),
  });
  for (const linea of inputLog.slice(1)) {
    const sp = linea.indexOf(' ');
    const tipo = sp < 0 ? linea.slice(1) : linea.slice(1, sp);
    const msg = sp < 0 ? '' : linea.slice(sp + 1);
    if (tipo === 'player') {
      const corte = msg.indexOf(' ');
      battle.setPlayer(msg.slice(0, corte) as Lado, JSON.parse(msg.slice(corte + 1)));
    } else if (tipo === 'p1' || tipo === 'p2') {
      if (msg === 'undo') battle.undoChoice(tipo);
      else battle.choose(tipo, msg);
    } else if (tipo === 'forcelose') {
      battle.lose(msg as Lado);
    } else if (tipo === 'forcewin') {
      battle.win(msg as Lado);
    } else if (tipo === 'forcetie') {
      battle.win(null);
    }
    battle.sendUpdates(); // el simulador no lo hace solo
  }
  return battle;
}
