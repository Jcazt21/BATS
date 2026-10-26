import { useCallback, useEffect, useState } from "react";
import { loadLearnset } from "./learnsets";

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export interface LearnsetState {
  /** Ids de movimiento legales; `null` mientras carga (o si falló), `[]` si no hay especie. */
  learnset: string[] | null;
  error: Error | null;
  /** Vuelve a pedir el bucket que falló (loadBucket ya lo sacó de la caché). */
  retry: () => void;
}

/** Learnset de una sola especie: `null` mientras carga, `error` si el fetch falla. */
export function useLearnset(speciesId: string | null): LearnsetState {
  const [attempt, setAttempt] = useState(0);
  // El resultado lleva la clave de la petición que lo produjo: si cambia la especie o se
  // reintenta, un resultado viejo deja de valer sin tener que limpiar estado en el efecto.
  const requestKey = `${speciesId ?? ""}#${attempt}`;
  const [result, setResult] = useState<{ key: string; learnset: string[] | null; error: Error | null } | null>(null);

  useEffect(() => {
    if (!speciesId) return;
    let alive = true;
    loadLearnset(speciesId).then(
      (learnset) => {
        if (alive) setResult({ key: requestKey, learnset, error: null });
      },
      (e: unknown) => {
        if (alive) setResult({ key: requestKey, learnset: null, error: toError(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [speciesId, requestKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (!speciesId) return { learnset: [], error: null, retry };
  const current = result?.key === requestKey ? result : null;
  return { learnset: current?.learnset ?? null, error: current?.error ?? null, retry };
}

export interface LearnsetsState {
  map: Record<string, string[]>;
  /** Hay especies cuyo learnset aún no llegó (y no ha fallado). */
  pending: boolean;
  error: Error | null;
  retry: () => void;
}

/**
 * Learnsets de varias especies a la vez (para validar el equipo completo). Se recalcula
 * por el CONTENIDO del conjunto de ids, no por la referencia del array (que cambia en
 * cada render de quien llama).
 */
export function useLearnsets(speciesIds: string[]): LearnsetsState {
  const key = [...new Set(speciesIds)].sort().join(",");
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${key}#${attempt}`;
  const [result, setResult] = useState<{ key: string; map: Record<string, string[]>; error: Error | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const ids = key.split(",");
    Promise.all(ids.map(async (id) => [id, await loadLearnset(id)] as const)).then(
      (entries) => {
        if (alive) setResult({ key: requestKey, map: Object.fromEntries(entries), error: null });
      },
      (e: unknown) => {
        if (alive) setResult({ key: requestKey, map: {}, error: toError(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, requestKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (!key) return { map: {}, pending: false, error: null, retry };
  const current = result?.key === requestKey ? result : null;
  return { map: current?.map ?? {}, pending: !current, error: current?.error ?? null, retry };
}
