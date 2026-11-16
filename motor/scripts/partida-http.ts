/**
 * E2E de la fase 2 (F2.11): crea una batalla `ready` por SQL en la base de test, firma dos JWT
 * locales (ES256, JWKS local) y hace que dos jugadores al azar la jueguen hasta el final **solo
 * por HTTP** contra un servidor real (`node:http`). Comprueba que ninguno vio datos del otro.
 *
 *   eval "$(tools/arena_testdb.sh up)"
 *   npx tsx motor/scripts/partida-http.ts [--seed 3]
 *
 * También lo usa `motor/test/db/partida-http.db.test.ts` (job `integracion`).
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import type pg from 'pg';

import { cuentaPorEmail } from '../src/db/repo.js';
import { crearApp } from '../src/http/app.js';
import { crearIdentify } from '../src/http/auth.js';
import { crearBatallaReady, poolDeTest } from '../test/helpers/db.js';
import { doradas } from '../test/helpers/doradas.js';
import { crearAzar, eleccionesPosibles } from './eleccion-azar.js';
import { crearServidor, escuchar } from './servidor.js';

const SUPABASE = 'https://local.supabase.test';
const MAX_PASOS = 2000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

interface Jugador {
  username: string;
  token: string;
  /** Cuerpo de cada respuesta que recibió, tal cual. */
  respuestas: string[];
  /** Peticiones propias que recibió (para comprobar que no aparecen en las del rival). */
  peticiones: string[];
  since: number;
  vista: Json;
}

export interface ResultadoPartida {
  id: number;
  estado: string;
  ganador: string | null;
  turnos: number;
  /** Cada hallazgo es una filtración de datos entre jugadores; debe estar vacía. */
  filtraciones: string[];
}

async function firmar(clave: CryptoKey, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'ES256', kid: 'local' })
    .setSubject(randomUUID())
    .setAudience('authenticated')
    .setIssuer(`${SUPABASE}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(clave);
}

export async function jugarPartidaHttp(pool: pg.Pool, semilla = 1): Promise<ResultadoPartida> {
  const azar = crearAzar(semilla);
  const par = await generateKeyPair('ES256');
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(par.publicKey)), kid: 'local', alg: 'ES256', use: 'sig' }] });

  const sufijo = randomUUID().slice(0, 8);
  const jugadores: Record<'p1' | 'p2', Jugador> = { p1: null as never, p2: null as never };
  for (const lado of ['p1', 'p2'] as const) {
    const username = `${lado}_http_${sufijo}`;
    const email = `${username}@liga.test`;
    await pool.query('INSERT INTO tournament.player_accounts (email, username) VALUES ($1, $2)', [email, username]);
    jugadores[lado] = { username, token: await firmar(par.privateKey, email), respuestas: [], peticiones: [], since: 0, vista: null };
  }

  const dorada = doradas[semilla % doradas.length];
  const id = await crearBatallaReady(pool, dorada, { p1: jugadores.p1.username, p2: jugadores.p2.username, turnSeconds: null });

  const app = crearApp({
    pool: () => pool,
    mode: () => 'all',
    env: { BATS_SUPABASE_URL: SUPABASE, BATS_ARENA_MODE: 'all' },
    identify: crearIdentify({ env: { BATS_SUPABASE_URL: SUPABASE }, jwks, buscarCuenta: email => cuentaPorEmail(pool, email) }),
  });
  const servidor = await escuchar(crearServidor(app));

  async function pedir(j: Jugador, ruta: string, cuerpo?: unknown): Promise<{ status: number; json: Json }> {
    const res = await fetch(`${servidor.url}/api/motor${ruta}`, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${j.token}`, 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await res.text();
    j.respuestas.push(texto);
    return { status: res.status, json: JSON.parse(texto) };
  }

  async function refrescar(j: Jugador): Promise<void> {
    const { status, json } = await pedir(j, `/battles/${id}?since=${j.since}`);
    if (status !== 200) throw new Error(`GET /battles/${id} → ${status} ${JSON.stringify(json)}`);
    j.vista = json;
    j.since = json.seq;
    if (json.request) j.peticiones.push(JSON.stringify(json.request));
  }

  try {
    for (let paso = 0; ; paso++) {
      if (paso > MAX_PASOS) throw new Error('la batalla no termina');
      await Promise.all([refrescar(jugadores.p1), refrescar(jugadores.p2)]);
      if (jugadores.p1.vista.status === 'finished') break;

      const pendientes = (['p1', 'p2'] as const).filter(l => {
        const v = jugadores[l].vista;
        return v.request && !v.request.wait && !v.chosen;
      });
      if (!pendientes.length) throw new Error(`nadie puede elegir (paso ${paso})`);
      const lado = pendientes[Math.floor(azar() * pendientes.length)];
      const j = jugadores[lado];

      let hecho = false;
      for (const choice of eleccionesPosibles(j.vista.request, azar)) {
        const r = await pedir(j, `/battles/${id}/choose`, { seq: j.vista.seq, choice });
        if (r.status === 200) {
          hecho = true;
          break;
        }
        if (r.status !== 422) throw new Error(`choose → ${r.status} ${JSON.stringify(r.json)}`);
        await refrescar(j); // la petición puede haberse reemitido
      }
      if (!hecho) throw new Error(`${lado} no encontró una elección válida`);
    }

    const filtraciones: string[] = [];
    for (const lado of ['p1', 'p2'] as const) {
      const rival = jugadores[lado === 'p1' ? 'p2' : 'p1'];
      const texto = jugadores[lado].respuestas.join('\n');
      for (const secreto of ['sodium,', '"seed"', 'inputLog', 'input_log', 'p1_team', 'p2_team', 'pending']) {
        if (texto.includes(secreto)) filtraciones.push(`${lado} recibió "${secreto}"`);
      }
      for (const peticion of new Set(rival.peticiones)) {
        if (texto.includes(peticion)) filtraciones.push(`${lado} recibió una petición de ${rival.username}`);
      }
    }

    const { rows } = await pool.query('SELECT status, winner, turn FROM arena.battles WHERE battle_id = $1', [id]);
    return { id, estado: rows[0].status, ganador: rows[0].winner, turnos: rows[0].turn, filtraciones };
  } finally {
    await servidor.cerrar();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--seed');
  const semilla = i >= 0 ? Number(process.argv[i + 1]) : 1;
  const pool = poolDeTest();
  try {
    const r = await jugarPartidaHttp(pool, semilla);
    console.log(`Batalla ${r.id}: ${r.estado} en ${r.turnos} turnos · ganó ${r.ganador ?? 'nadie (empate)'}`);
    if (r.filtraciones.length) {
      console.error('FILTRACIONES:\n' + r.filtraciones.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('Ningún jugador vio datos del otro.');
    }
  } finally {
    await pool.end();
  }
}
