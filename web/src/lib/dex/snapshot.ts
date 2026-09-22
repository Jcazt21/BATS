/**
 * Carga el snapshot del dex de Showdown (bats/tools/export_dex.js -> web/public/dex/*.json).
 * Reemplaza a lib/pokeapi.ts: sin red externa, con los mismos ids y datos que usa
 * config/formats.ts en el fork. Memoizado a nivel de módulo: un solo fetch por archivo.
 */

export interface DexMeta {
  generated_at: string;
  ps_commit: string;
  counts: { species: number; moves: number };
  formats: { league: string; sparring: string };
}

export interface Species {
  id: string;
  name: string;
  num: number;
  types: string[];
  bst: number;
  baseStats: Record<string, number>;
  color: string;
  eggGroups: string[];
  gen: number;
  tags: string[];
  abilities: string[];
  spriteid: string;
  baseSpecies: string;
  forme: string | null;
  prevo: string | null;
  isNonstandard: string | null;
  restricted: boolean;
  paradox: boolean;
  ultraBeast: boolean;
  pseudo: boolean;
  leagueLegal: boolean;
}

export interface Move {
  id: string;
  name: string;
  type: string;
  category: string;
  basePower: number;
  accuracy: number | boolean;
  pp: number;
  priority: number;
  shortDesc: string;
}

export interface Item {
  id: string;
  name: string;
  desc: string;
}

export interface Ability {
  id: string;
  name: string;
  desc: string;
}

export interface Nature {
  name: string;
  plus: string | null;
  minus: string | null;
}

export interface Dex {
  meta: DexMeta;
  species: Record<string, Species>;
  moves: Record<string, Move>;
  items: Record<string, Item>;
  abilities: Record<string, Ability>;
  natures: Record<string, Nature>;
}

const DEX_BASE = "/dex";

let cached: Promise<Dex> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

/** Carga el snapshot completo (memoizado). La URL de cada archivo se versiona con `meta.generated_at`. */
export function loadDex(): Promise<Dex> {
  if (!cached) {
    cached = (async () => {
      const meta = await fetchJson<DexMeta>(`${DEX_BASE}/meta.json`);
      const v = encodeURIComponent(meta.generated_at);
      const [species, moves, items, abilities, natures] = await Promise.all([
        fetchJson<Record<string, Species>>(`${DEX_BASE}/species.json?v=${v}`),
        fetchJson<Record<string, Move>>(`${DEX_BASE}/moves.json?v=${v}`),
        fetchJson<Record<string, Item>>(`${DEX_BASE}/items.json?v=${v}`),
        fetchJson<Record<string, Ability>>(`${DEX_BASE}/abilities.json?v=${v}`),
        fetchJson<Record<string, Nature>>(`${DEX_BASE}/natures.json?v=${v}`),
      ]);
      return { meta, species, moves, items, abilities, natures };
    })();
    // Si falla, no dejar el error cacheado: un reintento (p. ej. tras recuperar la red) vuelve a pedirlo.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

/** Solo para tests: limpia el snapshot memoizado entre casos. */
export function __resetDexForTests(): void {
  cached = null;
}

/** "Mr. Mime" / "mrmime" / "Urshifu-Rapid-Strike" -> el mismo id que usa Showdown (`toID`). */
export function toId(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Resuelve una especie por nombre o por id. `null` si no existe en el snapshot. */
export function speciesById(dex: Dex, nameOrId: string): Species | null {
  return dex.species[toId(nameOrId)] ?? null;
}

export interface SpeciesFilters {
  type?: string;
  gen?: number;
  color?: string;
  eggGroup?: string;
  /** Solo especies permitidas en la liga (`leagueLegal`). */
  onlyLegal?: boolean;
}

/** Búsqueda por nombre/id con filtros combinables. Sin límite: quien llama recorta el resultado. */
export function searchSpecies(dex: Dex, query: string, filters: SpeciesFilters = {}): Species[] {
  const q = query.trim().toLowerCase();
  const qId = toId(query);
  return Object.values(dex.species).filter((sp) => {
    if (q && !sp.name.toLowerCase().includes(q) && !sp.id.includes(qId)) return false;
    if (filters.type && !sp.types.some((t) => t.toLowerCase() === filters.type!.toLowerCase())) return false;
    if (filters.gen && sp.gen !== filters.gen) return false;
    if (filters.color && sp.color.toLowerCase() !== filters.color.toLowerCase()) return false;
    if (filters.eggGroup && !sp.eggGroups.some((g) => g.toLowerCase() === filters.eggGroup!.toLowerCase())) {
      return false;
    }
    if (filters.onlyLegal && !sp.leagueLegal) return false;
    return true;
  });
}
