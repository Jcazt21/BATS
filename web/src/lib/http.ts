import { getAccessToken, signOut } from "@/lib/session";

// En Vercel el SPA y la API comparten origen (VITE_API_URL vacío → rutas relativas).
// En desarrollo, Vite hace proxy de /api hacia 127.0.0.1:8011.
const BASE = import.meta.env.VITE_API_URL || "";

/** URL absoluta (o relativa en Vercel) de una ruta del API, para usarla en `<img src>`. */
export const apiUrl = (path: string): string => `${BASE}${path}`;

/** Error de la API: `status` HTTP y `detail` tal como lo devolvió el servidor. */
export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Parámetros de query; los `undefined`/`null` se omiten. */
  params?: Record<string, string | number | boolean | null | undefined>;
  /** Adjunta el token de la sesión. Con 401 se cierra la sesión (un único sitio). */
  auth?: boolean;
  signal?: AbortSignal;
  /** Mensaje si el servidor no da un `detail` legible. */
  fallback?: string;
}

function toQuery(params: RequestOptions["params"]): string {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${toQuery(opts.params)}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "No se pudo conectar con el servidor.");
  }

  if (!res.ok) {
    if (res.status === 401 && opts.auth) void signOut();
    const err = (await res.json().catch(() => ({}))) as { detail?: unknown };
    const detail = typeof err.detail === "string" ? err.detail : (opts.fallback ?? `Error ${res.status}`);
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Mensaje presentable de cualquier error. */
export function errorMessage(e: unknown, fallback = "Ocurrió un error."): string {
  if (e instanceof ApiError) return e.status >= 500 ? "El servidor tuvo un problema. Inténtalo de nuevo." : e.detail;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
