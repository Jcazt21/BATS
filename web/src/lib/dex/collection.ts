/**
 * Pokédex por cuenta: convierte los avistamientos del jugador (GET /api/players/{u}/pokedex)
 * en casillas por número nacional, usando el snapshot estático del dex.
 *
 * Reglas (plan docs/superpowers/plans/2026-11-12-pokedex-por-cuenta.md):
 *  - Una casilla por número (> 0). Ver cualquier forma descubre la casilla de su número.
 *  - Ver una especie descubre también su cadena de preevoluciones (`prevo`), solo hacia atrás.
 *    Una forma sin `prevo` propio (las megas) hereda la cadena de su especie base.
 *  - "seen" (visto en batalla) gana sobre "evolution" (descubierto por evolución).
 *  - El buscador por nombre solo encuentra casillas descubiertas; por número, cualquiera.
 */
import type { PokedexSighting } from "@/lib/api";
import { typeLabel, type PokemonType } from "@/lib/pokemon-types";
import { speciesById, toId, type DexEssentials, type Species } from "./snapshot";

export type DexStatus = "seen" | "evolution" | "unknown";

export interface DexFirstSeen { at: string; battleId: string; opponent: string; species: string }

export interface DexCell {
  num: number;
  /** Especie base del número (`forme === null`). */
  species: Species;
  status: DexStatus;
  /** Nombres de las formas vistas en batalla (solo con status "seen"). */
  seenForms: string[];
  firstSeen?: DexFirstSeen;
  /** Status "evolution": nombre de la especie vista que la descubrió. */
  via?: string;
}

export interface DexFilters {
  query: string;
  status: "all" | "discovered" | DexStatus;
  /** 0, 1 o 2 tipos (los pokémon tienen como mucho dos). Con varios, basta con tener uno (OR). */
  types: PokemonType[];
  gen: number | null;
}

/** Una sección de la grilla; `title` null = sin encabezado (0 o 1 tipo elegido). */
export interface DexSection { key: string; title: string | null; cells: DexCell[] }

export interface DexProgress {
  discovered: number;
  total: number;
  seen: number;
  evolution: number;
  byGen: { gen: number; discovered: number; total: number }[];
  last?: DexCell;
}

/** Especie base de cada número: la que no es forma; si no hay, la primera que aparezca. */
function baseByNum(dex: DexEssentials): Map<number, Species> {
  const byNum = new Map<number, Species>();
  for (const s of Object.values(dex.species)) {
    if (s.num <= 0) continue;
    const prev = byNum.get(s.num);
    if (!prev || (prev.forme !== null && s.forme === null)) byNum.set(s.num, s);
  }
  return byNum;
}

/** Preevolución directa; una forma sin `prevo` propio usa la de su especie base. */
function prevoOf(dex: DexEssentials, s: Species): Species | null {
  const name = s.prevo ?? (s.forme ? speciesById(dex, s.baseSpecies)?.prevo : null);
  return name ? speciesById(dex, name) : null;
}

export function buildCollection(dex: DexEssentials, seen: PokedexSighting[]): DexCell[] {
  const cells = new Map<number, DexCell>();
  for (const [num, species] of baseByNum(dex)) {
    cells.set(num, { num, species, status: "unknown", seenForms: [] });
  }

  // Del más antiguo al más reciente: el primero en llegar fija `via` y `firstSeen`.
  const ordered = [...seen].sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at));
  const resolved = ordered
    .map((s) => ({ sighting: s, species: dex.species[s.species_id] ?? speciesById(dex, s.species) }))
    .filter((r): r is { sighting: PokedexSighting; species: Species } => !!r.species && cells.has(r.species.num));

  for (const { sighting, species } of resolved) {
    const cell = cells.get(species.num)!;
    cell.status = "seen";
    cell.via = undefined;
    cell.seenForms.push(species.name);
    cell.firstSeen ??= { at: sighting.first_seen_at, battleId: sighting.battle_id, opponent: sighting.opponent, species: species.name };
  }

  for (const { species } of resolved) {
    const visited = new Set<string>([species.id]);
    for (let p = prevoOf(dex, species); p && !visited.has(p.id); p = prevoOf(dex, p)) {
      visited.add(p.id);
      const cell = cells.get(p.num);
      if (cell && cell.status === "unknown") {
        cell.status = "evolution";
        cell.via = species.name;
      }
    }
  }

  return [...cells.values()].sort((a, b) => a.num - b.num);
}

const isDiscovered = (c: DexCell) => c.status !== "unknown";
const hasType = (c: DexCell, t: PokemonType) => c.species.types.some((x) => toId(x) === t);

/** "6", "#6", "006", "#006" → 6; cualquier otra cosa → null. */
function parseNum(query: string): number | null {
  const m = query.trim().match(/^#?0*(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function filterCollection(cells: DexCell[], f: DexFilters): DexCell[] {
  const num = parseNum(f.query);
  const q = f.query.trim().toLowerCase();
  const qId = toId(f.query);
  return cells.filter((c) => {
    if (num !== null) {
      if (c.num !== num) return false;
    } else if (q) {
      // No revelar: el nombre solo busca entre lo descubierto.
      if (!isDiscovered(c)) return false;
      const names = [c.species.name, ...c.seenForms];
      if (!names.some((n) => n.toLowerCase().includes(q) || toId(n).includes(qId))) return false;
    }
    if (f.status === "discovered" ? !isDiscovered(c) : f.status !== "all" && c.status !== f.status) return false;
    if (f.types.length && !f.types.some((t) => hasType(c, t))) return false;
    if (f.gen !== null && c.species.gen !== f.gen) return false;
    return true;
  });
}

export function collectionProgress(cells: DexCell[]): DexProgress {
  const gens = new Map<number, { gen: number; discovered: number; total: number }>();
  let seen = 0;
  let evolution = 0;
  let last: DexCell | undefined;
  for (const c of cells) {
    const g = gens.get(c.species.gen) ?? { gen: c.species.gen, discovered: 0, total: 0 };
    g.total += 1;
    if (isDiscovered(c)) g.discovered += 1;
    gens.set(c.species.gen, g);
    if (c.status === "seen") {
      seen += 1;
      if (c.firstSeen && (!last?.firstSeen || c.firstSeen.at > last.firstSeen.at)) last = c;
    } else if (c.status === "evolution") {
      evolution += 1;
    }
  }
  return {
    discovered: seen + evolution, total: cells.length, seen, evolution,
    byGen: [...gens.values()].sort((a, b) => a.gen - b.gen), last,
  };
}

/** 6 → "#006". Se arma en código: un literal "#006" lo confundiría el guard de colores con un hex. */
export function dexNumber(num: number): string {
  return `#${String(num).padStart(3, "0")}`;
}

/**
 * Con dos tipos elegidos, parte la grilla en: los que tienen los dos, solo el primero y solo el
 * segundo (cada sección en el orden recibido; las vacías se omiten). Con 0 o 1 tipo, una sección.
 */
export function groupByTypes(cells: DexCell[], types: PokemonType[]): DexSection[] {
  if (types.length < 2) return [{ key: "all", title: null, cells }];
  const [a, b] = types;
  const sections: DexSection[] = [
    { key: `${a}+${b}`, title: `${typeLabel(a)} y ${typeLabel(b)}`, cells: cells.filter((c) => hasType(c, a) && hasType(c, b)) },
    { key: a, title: `Solo ${typeLabel(a)}`, cells: cells.filter((c) => hasType(c, a) && !hasType(c, b)) },
    { key: b, title: `Solo ${typeLabel(b)}`, cells: cells.filter((c) => hasType(c, b) && !hasType(c, a)) },
  ];
  return sections.filter((s) => s.cells.length > 0);
}
