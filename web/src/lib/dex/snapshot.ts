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

export interface Nature {
  name: string;
  plus: string | null;
  minus: string | null;
}

export interface DexEssentials {
  meta: DexMeta;
  species: Record<string, Species>;
  items: Record<string, Item>;
}

export interface DexDetails {
  moves: Record<string, Move>;
  natures: Record<string, Nature>;
}

export type Dex = DexEssentials & DexDetails;

const DEX_BASE = "/dex";

let metaCache: Promise<DexMeta> | null = null;
let essentialsCache: Promise<DexEssentials> | null = null;
let detailsCache: Promise<DexDetails> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

function loadMeta(): Promise<DexMeta> {
  if (!metaCache) {
    metaCache = fetchJson<DexMeta>(`${DEX_BASE}/meta.json`);
    metaCache.catch(() => { metaCache = null; });
  }
  return metaCache;
}

/** Especies y objetos para el picker, el equipo y sus reglas. */
export function loadDexEssentials(): Promise<DexEssentials> {
  if (!essentialsCache) {
    essentialsCache = (async () => {
      const meta = await loadMeta();
      const v = encodeURIComponent(meta.generated_at);
      const [species, items] = await Promise.all([
        fetchJson<Record<string, Species>>(`${DEX_BASE}/species.json?v=${v}`),
        fetchJson<Record<string, Item>>(`${DEX_BASE}/items.json?v=${v}`),
      ]);
      return { meta, species, items };
    })();
    essentialsCache.catch(() => { essentialsCache = null; });
  }
  return essentialsCache;
}

/** Movimientos y naturalezas para el editor de sets. */
export function loadDexDetails(): Promise<DexDetails> {
  if (!detailsCache) {
    detailsCache = (async () => {
      const meta = await loadMeta();
      const v = encodeURIComponent(meta.generated_at);
      const [moves, natures] = await Promise.all([
        fetchJson<Record<string, Move>>(`${DEX_BASE}/moves.json?v=${v}`),
        fetchJson<Record<string, Nature>>(`${DEX_BASE}/natures.json?v=${v}`),
      ]);
      return { moves, natures };
    })();
    detailsCache.catch(() => { detailsCache = null; });
  }
  return detailsCache;
}

/** Solo para tests: limpia las tres cachés entre casos. */
export function __resetDexForTests(): void {
  metaCache = null;
  essentialsCache = null;
  detailsCache = null;
}

/** "Mr. Mime" / "mrmime" / "Urshifu-Rapid-Strike" -> el mismo id que usa Showdown (`toID`). */
export function toId(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Resuelve una especie por nombre o por id. `null` si no existe en el snapshot. */
export function speciesById(dex: DexEssentials, nameOrId: string): Species | null {
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

/** Orden del buscador: nombre y número ascendentes; BST y velocidad, de mayor a menor. */
export type SpeciesSort = "name" | "num" | "bst" | "spe";

const SORTERS: Record<SpeciesSort, (a: Species, b: Species) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  num: (a, b) => a.num - b.num || a.name.localeCompare(b.name),
  bst: (a, b) => b.bst - a.bst || a.num - b.num,
  spe: (a, b) => (b.baseStats.spe ?? 0) - (a.baseStats.spe ?? 0) || a.num - b.num,
};

/**
 * Búsqueda por nombre/id con filtros combinables. Sin límite: quien llama recorta el resultado.
 * Sin `sort` se conserva el orden del snapshot.
 */
export function searchSpecies(dex: DexEssentials, query: string, filters: SpeciesFilters = {}, sort?: SpeciesSort): Species[] {
  const q = query.trim().toLowerCase();
  const qId = toId(query);
  const found = Object.values(dex.species).filter((sp) => {
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
  return sort ? found.sort(SORTERS[sort]) : found;
}
