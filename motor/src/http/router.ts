import { HttpError, errorResponse } from './errors.js';
import { exigirTokenServicio } from './auth.js';
import { arenaAllows, arenaMode, type ArenaMode, type Identidad } from './flags.js';

/** Todas las rutas del motor cuelgan de aquí (rewrite `/api/motor/(.*)` en `vercel.json`). */
export const PREFIJO = '/api/motor';

export interface Contexto {
  request: Request;
  url: URL;
  /** Segmentos `:nombre` de la ruta. */
  params: Record<string, string>;
  /** Quién llama; presente en las rutas con `acceso: 'jugador'`. */
  identidad?: Identidad & { username?: string };
}

export interface Ruta {
  method: 'GET' | 'POST';
  /** Relativa al prefijo, p. ej. `/battles/:id/choose`. */
  path: string;
  /** Solo `health`: responde aunque Arena esté apagada. */
  publica?: boolean;
  /**
   * Cómo se autentica quien llama. `jugador`: JWT de Supabase (la identidad llega en el contexto).
   * `{ servicio }`: token de máquina en esa variable de entorno (con Arena apagada, 404; en
   * `admins` pasa: lo llama FastAPI, que no es administrador).
   */
  acceso?: 'jugador' | { servicio: string };
  handler: (ctx: Contexto) => Response | Promise<Response>;
}

function emparejar(patron: string, ruta: string): Record<string, string> | null {
  const esperados = patron.split('/');
  const recibidos = ruta.split('/');
  if (esperados.length !== recibidos.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < esperados.length; i++) {
    if (esperados[i].startsWith(':')) {
      if (!recibidos[i]) return null;
      params[esperados[i].slice(1)] = decodeURIComponent(recibidos[i]);
    } else if (esperados[i] !== recibidos[i]) {
      return null;
    }
  }
  return params;
}

export interface OpcionesRouter {
  mode?: () => ArenaMode;
  /** Quién llama (verifica el JWT; lanza `HttpError` 401/403). Sin ella, `admins` queda cerrado. */
  identify?: (request: Request) => Promise<(Identidad & { username?: string }) | null>;
  /** Variables de entorno para los tokens de servicio. */
  env?: Record<string, string | undefined>;
}

export function createRouter(
  rutas: Ruta[],
  opciones: OpcionesRouter = {},
): (request: Request) => Promise<Response> {
  const mode = opciones.mode ?? (() => arenaMode());
  return async request => {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith(`${PREFIJO}/`)) {
        const relativa = url.pathname.slice(PREFIJO.length);
        for (const ruta of rutas) {
          if (ruta.method !== request.method) continue;
          const params = emparejar(ruta.path, relativa);
          if (!params) continue;
          let identidad: (Identidad & { username?: string }) | null = null;
          if (!ruta.publica) {
            const actual = mode();
            const servicio = typeof ruta.acceso === 'object' ? ruta.acceso.servicio : null;
            if (servicio) {
              if (actual === 'off') break;
              exigirTokenServicio(request, servicio, opciones.env);
            } else {
              if (actual === 'off') break;
              if (actual === 'admins' || ruta.acceso === 'jugador') {
                identidad = (await opciones.identify?.(request)) ?? null;
              }
              if (!arenaAllows(actual, identidad ?? (ruta.acceso === 'jugador' ? { isAdmin: false } : null))) break;
              if (ruta.acceso === 'jugador' && !identidad) {
                return errorResponse(401, 'unauthorized', 'Falta el token de autenticación.');
              }
            }
          }
          return await ruta.handler({ request, url, params, identidad: identidad ?? undefined });
        }
      }
      return errorResponse(404, 'not_found', 'Ruta no encontrada');
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.status, error.code, error.message);
      // El detalle se queda en el log del servidor: puede contener semillas o equipos.
      console.error('[motor] error no controlado', error);
      return errorResponse(500, 'internal', 'Error interno del motor');
    }
  };
}
