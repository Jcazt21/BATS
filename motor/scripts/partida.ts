/**
 * Demostración del núcleo (F1.13): juega una batalla entre dos jugadores al azar usando solo
 * `start`/`apply`/`viewFor` y la imprime como la vería p1 (texto de `@pkmn/view`).
 *
 *   npm run motor:partida -- --seed 7
 */
import { Battle } from '@pkmn/client';
import { Generations } from '@pkmn/data';
import { Dex } from '@pkmn/dex';
import { Protocol } from '@pkmn/protocol';
import { LogFormatter } from '@pkmn/view';

import { viewFor } from '../src/core/view.js';
import { jugarAlAzar } from '../test/helpers/azar.js';

function leerSemilla(argv: string[]): number {
  const i = argv.indexOf('--seed');
  const valor = i >= 0 ? Number(argv[i + 1]) : 1;
  if (!Number.isInteger(valor)) throw new Error('Uso: npm run motor:partida -- --seed <entero>');
  return valor;
}

/** El formateador marca el HP exacto y el porcentaje como `||exacto||porcentaje||` (HTML del cliente). */
const limpiar = (texto: string) => texto.replace(/\|\|[^|]*\|\|([^|]*)\|\|/g, '$1');

const semilla = leerSemilla(process.argv.slice(2));
const partida = jugarAlAzar(semilla);
const { record } = partida;

console.log(`Arena · demostración · semilla ${semilla}`);
console.log(`${record.p1.name} (p1) vs ${record.p2.name} (p2) · ${record.rules.split('@@@')[0]}`);
console.log('-'.repeat(60));

const lineas = viewFor('p1', [partida.lineas])[0];
const battle = new Battle(new Generations(Dex));
const formatter = new LogFormatter('p1', battle);
for (const { args, kwArgs } of Protocol.parse(lineas.join('\n'))) {
  const texto = formatter.formatText(args, kwArgs); // siempre antes de battle.add
  battle.add(args, kwArgs);
  if (args[0] === 'turn') console.log(`\n=== Turno ${args[1]} ===`);
  else if (texto.trim()) console.log(limpiar(texto).trimEnd());
}

console.log('-'.repeat(60));
console.log(`Terminó en el turno ${record.turn}: ${record.winner ?? 'empate'} (${record.endType}).`);
console.log(`${partida.elecciones.length} elecciones; ${record.seq} tandas; inputLog de ${record.inputLog.length} líneas.`);
