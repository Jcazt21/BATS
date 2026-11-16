import { waitUntil as waitUntilVercel } from '@vercel/functions';
import type pg from 'pg';

import { cuentaPorEmail } from '../db/repo.js';
import { getPool } from '../db/pool.js';
import { validateTeam } from '../engine/format.js';
import type { PokemonSet } from '../engine/sim.js';
import { accionar, obtenerVista, type AccionCliente, type Reloj } from '../service/battles.js';
import { crearIdentify, type IdentidadJugador } from './auth.js';
import { HttpError, json } from './errors.js';
import { arenaMode, type ArenaMode } from './flags.js';
import { health } from './health.js';
import { createRouter, type Contexto, type Ruta } from './router.js';

/** Dependencias del motor: todo lo que toca el mundo exterior entra por aquí (los tests lo sustituyen). */
export interface Deps {
  pool: () => pg.Pool;
  identify: (request: Request) => Promise<IdentidadJugador>;
  mode?: () => ArenaMode;
  env?: Record<string, string | undefined>;
  reloj?: Reloj;
  fetch?: typeof fetch;
  waitUntil?: (promesa: Promise<unknown>) => void;
}

const LIMITE_ACCION = 2 * 1024;
const LIMITE_EQUIPO = 64 * 1024;
const ELECCION = /^[a-z0-9 ,\-]{1,80}$/;

/** Cuerpo JSON acotado: `{}` si no hay cuerpo; 400 si no es JSON, no es un objeto o es demasiado grande. */
async function leerCuerpo(request: Request, limite: number): Promise<Record<string, unknown>> {
  const texto = await request.text();
  if (new TextEncoder().encode(texto).length > limite) {
    throw new HttpError(400, 'bad_request', `El cuerpo supera el límite de ${limite} bytes.`);
  }
  if (texto.trim() === '') return {};
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    throw new HttpError(400, 'bad_request', 'El cuerpo no es JSON válido.');
  }
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new HttpError(400, 'bad_request', 'El cuerpo debe ser un objeto JSON.');
  }
  return valor as Record<string, unknown>;
}

function idDe(ctx: Contexto): number {
  const crudo = ctx.params.id;
  if (!/^\d{1,15}$/.test(crudo)) throw new HttpError(404, 'not_found', 'Batalla no encontrada');
  return Number(crudo);
}

function usuarioDe(ctx: Contexto): string {
  const usuario = ctx.identidad?.username;
  if (!usuario) throw new HttpError(401, 'unauthorized', 'Falta el token de autenticación.');
  return usuario;
}

/** Arma el router del motor con sus dependencias. */
export function crearApp(deps: Deps): { fetch: (request: Request) => Promise<Response> } {
  const env = deps.env ?? process.env;
  const hacerFetch = deps.fetch ?? fetch;
  // Fuera de Vercel (servidor local) no hay contexto al que colgar la promesa: sigue corriendo sola.
  const esperar =
    deps.waitUntil ??
    ((p: Promise<unknown>) => {
      try {
        waitUntilVercel(p);
      } catch {
        void p;
      }
    });

  /** Avisa a la ingesta de que hay una batalla terminada; un fallo aquí nunca rompe el turno. */
  function avisarIngesta(request: Request, id: number): void {
    const token = env.BATS_INGEST_TOKEN;
    if (!token) return; // el cron de respaldo la recogerá (fase 4)
    const base = (env.BATS_API_URL ?? new URL(request.url).origin).replace(/\/+$/, '');
    esperar(
      hacerFetch(`${base}/api/ingest/arena/${id}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      }).catch(error => console.error('[motor] aviso de ingesta falló', id, error instanceof Error ? error.message : error)),
    );
  }

  async function accion(ctx: Contexto, tipo: AccionCliente['type']): Promise<Response> {
    const id = idDe(ctx);
    const usuario = usuarioDe(ctx);
    const cuerpo = await leerCuerpo(ctx.request, LIMITE_ACCION);
    let orden: AccionCliente;
    if (tipo === 'choose') {
      const { seq, choice } = cuerpo;
      if (!Number.isInteger(seq) || (seq as number) < 0) throw new HttpError(400, 'bad_request', '`seq` debe ser un entero.');
      if (typeof choice !== 'string' || !ELECCION.test(choice)) {
        throw new HttpError(400, 'bad_request', '`choice` no tiene un formato válido.');
      }
      orden = { type: 'choose', seq: seq as number, choice };
    } else {
      orden = { type: tipo };
    }
    const resultado = await accionar(deps.pool(), id, usuario, orden, deps.reloj);
    if (resultado.ingest) avisarIngesta(ctx.request, id);
    return json({ seq: resultado.seq, resolved: resultado.resolved });
  }

  const rutas: Ruta[] = [
    { method: 'GET', path: '/health', publica: true, handler: health },
    {
      method: 'POST',
      path: '/validate-team',
      acceso: { servicio: 'BATS_MOTOR_TOKEN' },
      handler: async ctx => {
        const { rules, team } = await leerCuerpo(ctx.request, LIMITE_EQUIPO);
        if (typeof rules !== 'string' || !rules) throw new HttpError(400, 'bad_request', '`rules` es obligatorio.');
        if (!Array.isArray(team)) throw new HttpError(400, 'bad_request', '`team` debe ser una lista.');
        return json({ errors: validateTeam(rules, team as PokemonSet[]) });
      },
    },
    {
      method: 'GET',
      path: '/battles/:id',
      acceso: 'jugador',
      handler: async ctx => {
        const since = Number(ctx.url.searchParams.get('since') ?? 0);
        if (!Number.isInteger(since) || since < 0) throw new HttpError(400, 'bad_request', '`since` debe ser un entero.');
        return json(await obtenerVista(deps.pool(), idDe(ctx), usuarioDe(ctx), since, deps.reloj));
      },
    },
    ...(['choose', 'undo', 'forfeit', 'timeout'] as const).map(
      (tipo): Ruta => ({
        method: 'POST',
        path: `/battles/:id/${tipo}`,
        acceso: 'jugador',
        handler: ctx => accion(ctx, tipo),
      }),
    ),
  ];

  return { fetch: createRouter(rutas, { mode: deps.mode ?? (() => arenaMode(env)), identify: deps.identify, env }) };
}

/** Dependencias reales: pool de módulo y verificación de JWT contra Supabase. */
export function depsDeProduccion(): Deps {
  return {
    pool: getPool,
    identify: crearIdentify({ buscarCuenta: email => cuentaPorEmail(getPool(), email) }),
  };
}
