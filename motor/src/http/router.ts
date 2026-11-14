import { HttpError, errorResponse } from './errors.js';
import { arenaAllows, arenaMode, type ArenaMode, type Identidad } from './flags.js';

/** Todas las rutas del motor cuelgan de aquí (rewrite `/api/motor/(.*)` en `vercel.json`). */
export const PREFIJO = '/api/motor';

export interface Contexto {
  request: Request;
  url: URL;
  /** Segmentos `:nombre` de la ruta. */
  params: Record<string, string>;
}

export interface Ruta {
  method: 'GET' | 'POST';
  /** Relativa al prefijo, p. ej. `/battles/:id/choose`. */
  path: string;
  /** Solo `health`: responde aunque Arena esté apagada. */
  publica?: boolean;
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
  /** Quién llama (la verificación del JWT llega en la fase 2). Sin ella, `admins` queda cerrado. */
  identify?: (request: Request) => Promise<Identidad | null>;
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
          if (!ruta.publica) {
            const actual = mode();
            const identidad = actual === 'admins' ? ((await opciones.identify?.(request)) ?? null) : null;
            if (!arenaAllows(actual, identidad)) break;
          }
          return await ruta.handler({ request, url, params });
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
