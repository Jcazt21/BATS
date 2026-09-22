import { useEffect, useState } from "react";
import { loadLearnset } from "./learnsets";

/** Learnset de una sola especie (o `[]` mientras carga / si `speciesId` es null). */
export function useLearnset(speciesId: string | null): string[] {
  const [learnset, setLearnset] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const next = speciesId ? await loadLearnset(speciesId) : [];
      if (alive) setLearnset(next);
    })();
    return () => {
      alive = false;
    };
  }, [speciesId]);
  return learnset;
}

/**
 * Learnsets de varias especies a la vez (para validar el equipo completo). Se recalcula
 * por el CONTENIDO del conjunto de ids, no por la referencia del array (que cambia en
 * cada render de quien llama).
 */
export function useLearnsets(speciesIds: string[]): Record<string, string[]> {
  const key = [...new Set(speciesIds)].sort().join(",");
  const [map, setMap] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let alive = true;
    const ids = key ? key.split(",") : [];
    (async () => {
      const entries = await Promise.all(ids.map(async (id) => [id, await loadLearnset(id)] as const));
      if (alive) setMap(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  return map;
}
