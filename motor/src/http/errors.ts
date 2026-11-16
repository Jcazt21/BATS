/**
 * Errores HTTP del motor. Misma forma que FastAPI (`{detail}`) más un `code` estable, para que
 * `web/src/lib/http.ts` los trate igual que los de la API de Python.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, detail: string) {
    super(detail);
    this.status = status;
    this.code = code;
  }
}

const SIN_CACHE = { 'cache-control': 'no-store' };

export function json(cuerpo: unknown, status = 200): Response {
  return Response.json(cuerpo, { status, headers: SIN_CACHE });
}

export function errorResponse(status: number, code: string, detail: string): Response {
  return json({ detail, code }, status);
}
