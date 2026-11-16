#!/usr/bin/env node
/**
 * Genera las fixtures doradas de Arena a partir de los logs reales de Showdown.
 *
 *   node tools/arena_fixtures.mjs            escribe tests/fixtures/arena/golden/dorada-NN.json
 *   node tools/arena_fixtures.mjs --check    regenera en memoria y falla si difiere de lo commiteado
 *
 * Lee los `.log.json` de BATS_LOGS_DIR (por defecto ../pokemon-showdown/logs; solo lectura).
 *
 * El repo es público, así que las fixtures van ANONIMIZADAS: los usernames pasan a `jugadorN`
 * y los apodos al nombre de la especie. Equipos y semillas son los reales. Por cada batalla:
 *
 *   1. Rejuega el `inputLog` real con el motor y exige que el log coincida con el de Showdown.
 *   2. Anonimiza el `inputLog` y lo rejuega: ese es el log dorado. Nombres y apodos no tocan
 *      el PRNG, así que debe coincidir línea a línea con el real una vez sustituidos.
 *   3. Deriva lo que guardaría el motor: tandas crudas (con `|split|`) y la vista de cada rol.
 *      La petición vigente de cada lado tras cada tanda se guarda solo en la dorada más corta:
 *      pesan ~170 KB por batalla y cualquier otra se obtiene rejugando su `inputLog`.
 *
 * Las líneas `|t:|` (reloj de pared) se eliminan: cambian en cada rejugada.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Battle, Dex, Teams, extractChannelMessages, toID } from '../motor/src/engine/sim.ts';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOGS_DIR = process.env.BATS_LOGS_DIR || resolve(RAIZ, '..', 'pokemon-showdown', 'logs');
const SALIDA = join(RAIZ, 'tests', 'fixtures', 'arena', 'golden');

/** Formato de liga como reglas custom (apéndice A del plan). Las reglas mensuales no van aquí. */
const RULES = 'gen9nationaldexag@@@Standard NatDex,-Baton Pass,Limit One Restricted,' +
  '*Sub-Legendary,*Restricted Legendary,*Mythical,Item Clause = 1';
const FORMATOS = new Set(['gen9pinchesgueysleague', 'gen9pglsparring']);

/** Líneas que Showdown añade o que dependen del formato o del reloj: fuera de la comparación. */
const IGNORADAS = /^\|(rule|tier|t:|-message|player|c|c:|j|l|n|raw|html|uhtml|inactive|inactiveoff)\|/;
const RELOJ = /^\|t:\|/;

function buscarLogs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return buscarLogs(ruta);
    return e.name.endsWith('.log.json') ? [ruta] : [];
  });
}

/** Rejuega un inputLog (empezando en `>start`) y agrupa la salida en tandas. */
function rejugar(inputLog) {
  const start = JSON.parse(inputLog[0].slice('>start '.length));
  const tandas = [];
  const requests = { p1: null, p2: null };
  let lineas = [];
  const battle = new Battle({
    ...start,
    send(tipo, datos) {
      if (tipo === 'update') {
        lineas.push(...(Array.isArray(datos) ? datos : datos.split('\n')));
      } else if (tipo === 'sideupdate') {
        const texto = Array.isArray(datos) ? datos.join('\n') : datos;
        const corte = texto.indexOf('\n');
        const lado = texto.slice(0, corte);
        const resto = texto.slice(corte + 1);
        if (!resto.startsWith('|request|')) throw new Error(`El motor rechazó una elección: ${resto}`);
        requests[lado] = JSON.parse(resto.slice('|request|'.length));
      }
    },
  });
  for (let i = 1; i < inputLog.length; i++) {
    const linea = inputLog[i];
    const sp = linea.indexOf(' ');
    const tipo = sp < 0 ? linea.slice(1) : linea.slice(1, sp);
    const msg = sp < 0 ? '' : linea.slice(sp + 1);
    if (tipo === 'player') {
      const corte = msg.indexOf(' ');
      battle.setPlayer(msg.slice(0, corte), JSON.parse(msg.slice(corte + 1)));
    } else if (tipo === 'p1' || tipo === 'p2') {
      if (msg === 'undo') battle.undoChoice(tipo);
      else if (!battle.choose(tipo, msg)) throw new Error(`Elección inválida: ${linea}`);
    } else if (tipo === 'forcelose') battle.lose(msg);
    else if (tipo === 'forcewin') battle.win(msg);
    else if (tipo === 'forcetie') battle.win(null);
    else throw new Error(`Línea de inputLog desconocida: ${linea}`);
    battle.sendUpdates(); // el simulador no lo hace solo
    // El arranque (los dos `>player`) es una sola tanda, como la emitirá el motor.
    const sigueArranque = inputLog[i + 1]?.startsWith('>player ');
    if (lineas.length && !sigueArranque) {
      tandas.push({
        lines: lineas.filter(l => !RELOJ.test(l)),
        requests: battle.ended ? { p1: null, p2: null } : { ...requests },
      });
      lineas = [];
    }
  }
  if (lineas.length) throw new Error('Quedó salida del motor sin asignar a una tanda');
  return { battle, tandas };
}

const canal = (lineas, n) => extractChannelMessages(lineas.join('\n'), [n])[n];
const omnisciente = tandas => tandas.flatMap(t => canal(t.lines, -1));
const comparable = lineas => lineas.filter(l => l !== '' && !IGNORADAS.test(l));

function primeraDiferencia(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `línea ${i}: motor=${JSON.stringify(a[i])} real=${JSON.stringify(b[i])}`;
  }
  return null;
}

const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const especieBase = set => Dex.species.get(set.species || set.name).baseSpecies;

/** Un fichero por línea de log / tanda: los diffs del snapshot quedan legibles. */
function serializar(obj) {
  const partes = Object.entries(obj).map(([clave, valor]) => {
    if (!Array.isArray(valor)) return `  ${JSON.stringify(clave)}: ${JSON.stringify(valor)}`;
    const filas = valor.map(v => `    ${JSON.stringify(v)}`).join(',\n');
    return `  ${JSON.stringify(clave)}: [\n${filas}\n  ]`;
  });
  return `{\n${partes.join(',\n')}\n}\n`;
}

const alias = new Map(); // id real → jugadorN (estable entre batallas: orden de aparición)
function aliasDe(nombre) {
  const id = toID(nombre);
  if (!alias.has(id)) alias.set(id, `jugador${alias.size + 1}`);
  return alias.get(id);
}

function generar(real, id, conPeticiones) {
  const inicio = real.inputLog.findIndex(l => l.startsWith('>start '));
  const inputReal = real.inputLog.slice(inicio);
  const start = { ...JSON.parse(inputReal[0].slice('>start '.length)), formatid: RULES };
  inputReal[0] = `>start ${JSON.stringify(start)}`;

  // 1. El motor reproduce la batalla real.
  const original = rejugar(inputReal);
  const logReal = comparable(real.log);
  let dif = primeraDiferencia(comparable(omnisciente(original.tandas)), logReal);
  if (dif) throw new Error(`${id}: el motor no reproduce el log real (${dif})`);

  // 2. Anonimizar el inputLog y volver a rejugar.
  const apodos = { p1: new Map(), p2: new Map() }; // apodo real → especie base, por lado
  const inputLog = inputReal.map(linea => {
    if (!linea.startsWith('>player ')) return linea;
    const [, lado, json] = /^>player (p[12]) (.*)$/s.exec(linea);
    const opciones = JSON.parse(json);
    const sets = Teams.unpack(opciones.team);
    for (const set of sets) {
      const base = especieBase(set);
      apodos[lado].set(set.name || base, base);
      set.name = base;
    }
    // Solo nombre y equipo: avatar y rating identifican a la cuenta.
    return `>player ${lado} ${JSON.stringify({ name: aliasDe(opciones.name), team: Teams.pack(sets) })}`;
  });
  const { battle, tandas } = rejugar(inputLog);

  // 3. Mismo log que el real una vez sustituidos nombres y apodos.
  const logRealAnonimo = logReal.map(linea => {
    if (linea.startsWith('|win|')) return `|win|${aliasDe(linea.slice('|win|'.length))}`;
    return linea.replace(/(p[12])([a-c]?): ([^|]+)/g, (todo, lado, pos, nombre) => {
      if (apodos[lado].has(nombre)) return `${lado}${pos}: ${apodos[lado].get(nombre)}`;
      // Sin posición y sin ser un Pokémon: es el lado entero (`|-sidestart|p2: <jugador>|…`).
      if (!pos && toID(nombre) === toID(real[lado])) return `${lado}: ${aliasDe(nombre)}`;
      return todo;
    });
  });
  dif = primeraDiferencia(comparable(omnisciente(tandas)), logRealAnonimo);
  if (dif) throw new Error(`${id}: el log anonimizado no equivale al real (${dif})`);
  if (battle.turn !== real.turns) throw new Error(`${id}: turnos ${battle.turn} ≠ ${real.turns}`);

  const equipo = (sets, lado) => sets.map(set => ({ ...set, name: apodos[lado].get(set.name) ?? especieBase(set) }));
  const fixture = {
    id,
    formatId: real.format,
    rules: RULES,
    seed: start.seed,
    p1: aliasDe(real.p1),
    p2: aliasDe(real.p2),
    winner: real.winner ? aliasDe(real.winner) : '',
    turns: battle.turn,
    endType: real.endType,
    p1team: equipo(real.p1team, 'p1'),
    p2team: equipo(real.p2team, 'p2'),
    inputLog,
    log: omnisciente(tandas),
    updates: tandas.map(t => t.lines),
    viewP1: tandas.map(t => canal(t.lines, 1)),
    viewP2: tandas.map(t => canal(t.lines, 2)),
    viewSpectator: tandas.map(t => canal(t.lines, 0)),
  };
  if (conPeticiones) fixture.requests = tandas.map(t => t.requests);
  if (toID(battle.winner) !== toID(fixture.winner)) throw new Error(`${id}: ganador distinto`);

  // 4. Nada identificable sobrevive en el texto final.
  const texto = serializar(fixture);
  const minusculas = texto.toLowerCase();
  const prohibidos = [real.p1, real.p2];
  for (const lado of ['p1', 'p2']) {
    for (const [apodo, base] of apodos[lado]) if (apodo !== base) prohibidos.push(apodo);
  }
  for (const palabra of prohibidos) {
    const patron = new RegExp(`(?<![a-z0-9])${escapar(palabra.toLowerCase())}(?![a-z0-9])`);
    if (patron.test(minusculas)) throw new Error(`${id}: un nombre o apodo real sobrevivió a la anonimización`);
  }
  return texto;
}

function main() {
  const comprobar = process.argv.includes('--check');
  const batallas = buscarLogs(LOGS_DIR)
    .map(ruta => ({ ruta, real: JSON.parse(readFileSync(ruta, 'utf8')) }))
    .filter(b => FORMATOS.has(b.real.format))
    .map(b => ({ ...b, numero: Number(/-(\d+)\.log\.json$/.exec(b.ruta)?.[1] ?? Infinity) }))
    .sort((a, b) => a.numero - b.numero || a.ruta.localeCompare(b.ruta));
  if (!batallas.length) throw new Error(`No hay logs de la liga en ${LOGS_DIR}`);

  const masCorta = batallas.reduce((a, b) => (b.real.turns < a.real.turns ? b : a));

  if (!comprobar) mkdirSync(SALIDA, { recursive: true });
  let bytes = 0;
  let distintas = 0;
  batallas.forEach((batalla, i) => {
    const id = `dorada-${String(i + 1).padStart(2, '0')}`;
    const texto = generar(batalla.real, id, batalla === masCorta);
    const destino = join(SALIDA, `${id}.json`);
    bytes += Buffer.byteLength(texto);
    if (comprobar) {
      let actual = null;
      try { actual = readFileSync(destino, 'utf8'); } catch { /* no existe */ }
      if (actual !== texto) { distintas++; console.error(`✗ ${id} difiere de lo commiteado`); }
    } else {
      writeFileSync(destino, texto);
    }
  });
  console.log(`${batallas.length} doradas, ${alias.size} jugadores, ${(bytes / 1024).toFixed(0)} KB`);
  if (distintas) process.exit(1);
}

main();
