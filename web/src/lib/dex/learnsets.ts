/**
 * Carga perezosa de los learnsets: son el archivo más pesado del snapshot, así que se
 * piden por bucket (`learnsets/<letra>.json`, la primera letra del id de la especie;
 * lo que no empieza por letra va en "0", ver tools/export_dex.js) y solo cuando hace falta.
 */
import { toId } from "./snapshot";

const buckets = new Map<string, Promise<Record<string, string[]>>>();

function bucketFor(speciesId: string): string {
  return /^[a-z]/.test(speciesId) ? speciesId[0] : "0";
}

function loadBucket(bucket: string): Promise<Record<string, string[]>> {
  let pending = buckets.get(bucket);
  if (!pending) {
    pending = fetch(`/dex/learnsets/${bucket}.json`).then((res) => {
      if (!res.ok) throw new Error(`No se pudo cargar el learnset "${bucket}" (HTTP ${res.status}).`);
      return res.json() as Promise<Record<string, string[]>>;
    });
    pending.catch(() => buckets.delete(bucket));
    buckets.set(bucket, pending);
  }
  return pending;
}

/** Ids de movimiento legales en NatDex para la especie (o su forma). `[]` si no aparece en el bucket. */
export async function loadLearnset(speciesId: string): Promise<string[]> {
  const id = toId(speciesId);
  const bucket = await loadBucket(bucketFor(id));
  return bucket[id] ?? [];
}

/** Solo para tests: limpia la caché de buckets entre casos. */
export function __resetLearnsetsForTests(): void {
  buckets.clear();
}
