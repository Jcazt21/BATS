import { HttpError, errorResponse } from './errors.js';

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

export function createRouter(rutas: Ruta[]): (request: Request) => Promise<Response> {
  return async request => {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith(`${PREFIJO}/`)) {
        const relativa = url.pathname.slice(PREFIJO.length);
        for (const ruta of rutas) {
          if (ruta.method !== request.method) continue;
          const params = emparejar(ruta.path, relativa);
          if (params) return await ruta.handler({ request, url, params });
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
