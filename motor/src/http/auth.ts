import { createHash, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';

import { HttpError } from './errors.js';
import type { Identidad } from './flags.js';

/**
 * Autenticación del motor. Espejo de `bats_core/api/auth.py` (mismas respuestas): JWT de Supabase
 * verificado con el JWKS del proyecto + cuenta dada de alta en `tournament.player_accounts`.
 * **Solo lee** esa tabla: enlazar `user_id` en el primer login lo sigue haciendo FastAPI.
 *
 * La identidad sale siempre del JWT; nunca del cuerpo ni de la URL (I5).
 */

export interface IdentidadJugador extends Identidad {
  username: string;
}

/** Fila de `tournament.player_accounts` que interesa para autenticar. */
export interface Cuenta {
  userId: string | null;
  username: string;
  isAdmin: boolean;
}

export interface OpcionesAuth {
  env?: Record<string, string | undefined>;
  /** Claves públicas; en tests se inyectan locales. Por defecto, el JWKS remoto del proyecto. */
  jwks?: JWTVerifyGetKey;
  /** `email` ya en minúsculas. */
  buscarCuenta: (email: string) => Promise<Cuenta | null>;
}

const ALGORITMOS = ['ES256', 'RS256'];
const NO_AUTORIZADO = () => new HttpError(401, 'unauthorized', 'Token inválido o expirado.');

const remotos = new Map<string, JWTVerifyGetKey>();

function jwksRemoto(url: string): JWTVerifyGetKey {
  let claves = remotos.get(url);
  if (!claves) {
    // jose cachea las claves y las vuelve a pedir si llega un `kid` desconocido (rotación).
    claves = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`), { timeoutDuration: 5_000 });
    remotos.set(url, claves);
  }
  return claves;
}

function tokenBearer(request: Request): string | null {
  const cabecera = request.headers.get('authorization') ?? '';
  const [esquema, token] = cabecera.split(' ');
  return esquema?.toLowerCase() === 'bearer' && token ? token : null;
}

export function crearIdentify(opciones: OpcionesAuth): (request: Request) => Promise<IdentidadJugador> {
  const env = opciones.env ?? process.env;
  return async request => {
    const url = (env.BATS_SUPABASE_URL ?? '').replace(/\/+$/, '');
    if (!url) throw new HttpError(503, 'unavailable', 'BATS_SUPABASE_URL no está configurado en el servidor.');

    const token = tokenBearer(request);
    if (!token) throw new HttpError(401, 'unauthorized', 'Falta el token de autenticación.');

    let claims;
    try {
      ({ payload: claims } = await jwtVerify(token, opciones.jwks ?? jwksRemoto(url), {
        algorithms: ALGORITMOS,
        audience: 'authenticated',
        issuer: `${url}/auth/v1`,
      }));
    } catch (error) {
      // Firma, expiración, audiencia, emisor o formato: 401. Si ni siquiera se pudo pedir el JWKS: 503.
      if (error instanceof errors.JWKSTimeout || !(error instanceof errors.JOSEError)) {
        throw new HttpError(503, 'unavailable', 'No se pudo obtener la clave de verificación.');
      }
      throw NO_AUTORIZADO();
    }

    const email = String(claims.email ?? '').trim().toLowerCase();
    if (!email || !claims.sub) throw NO_AUTORIZADO();

    const cuenta = await opciones.buscarCuenta(email);
    if (!cuenta) throw new HttpError(403, 'forbidden', 'Tu cuenta no está registrada en la liga.');
    if (cuenta.userId !== null && cuenta.userId !== claims.sub) {
      throw new HttpError(403, 'forbidden', 'Esta cuenta está vinculada a otro usuario.');
    }
    return { username: cuenta.username.toLowerCase(), isAdmin: cuenta.isAdmin };
  };
}

/**
 * Token de servicio (FastAPI → motor, cron). Lee la variable en cada petición; falla CERRADO
 * (503) si no está definida y compara en tiempo constante.
 */
export function exigirTokenServicio(
  request: Request,
  variable: string,
  env: Record<string, string | undefined> = process.env,
): void {
  const esperado = env[variable];
  if (!esperado) throw new HttpError(503, 'unavailable', `${variable} no está configurado en el servidor.`);
  const recibido = tokenBearer(request);
  if (!recibido) throw new HttpError(401, 'unauthorized', 'Falta el token de autenticación.');
  // Se comparan los hashes: mismo largo siempre y sin filtrar el largo del secreto.
  const a = createHash('sha256').update(recibido).digest();
  const b = createHash('sha256').update(esperado).digest();
  if (!timingSafeEqual(a, b)) throw new HttpError(401, 'unauthorized', 'Token inválido.');
}
