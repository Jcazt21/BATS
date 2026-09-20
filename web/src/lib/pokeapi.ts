export interface PokeResult {
  id: number;
  name: string;         // "garchomp"
  displayName: string;  // "Garchomp"
  types: string;        // "Dragon / Ground"
  sprite: string;       // URL
  color: string;        // "blue" | "green" | ...
  generation: number;   // 1–9
  egg_groups: string[]; // ["monster", "dragon"]
}

// Cache de la lista completa (cargada una sola vez al inicio)
let _allPokemon: { name: string; id: number }[] = [];

export async function loadAllPokemon(): Promise<void> {
  if (_allPokemon.length > 0) return;
  const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=1025&offset=0");
  const data = (await res.json()) as { results: { name: string; url: string }[] };
  _allPokemon = data.results.map((p) => {
    const parts = p.url.split("/").filter(Boolean);
    return { name: p.name, id: Number(parts[parts.length - 1]) };
  });
}

export function searchPokemon(query: string, limit = 20): { name: string; id: number }[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().replace(/\s+/g, "-");
  return _allPokemon
    .filter((p) => p.name.includes(q))
    .slice(0, limit);
}

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9,
};

function parseGeneration(name: string): number {
  // "generation-iv" → 4
  const part = name.split("-").slice(1).join("-");
  return ROMAN[part] ?? 0;
}

const _detailCache = new Map<number, PokeResult>();

export async function getPokemonDetail(id: number): Promise<PokeResult> {
  if (_detailCache.has(id)) return _detailCache.get(id)!;

  const [pokeRes, speciesRes] = await Promise.all([
    fetch(`https://pokeapi.co/api/v2/pokemon/${id}`),
    fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`).catch(() => null),
  ]);

  const data = await pokeRes.json();
  const speciesData = speciesRes?.ok ? await speciesRes.json() : null;

  const displayName = data.name
    .split("-")
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");

  const types: string = (data.types as { type: { name: string } }[])
    .map((t) => t.type.name.charAt(0).toUpperCase() + t.type.name.slice(1))
    .join(" / ");

  const sprite: string =
    data.sprites?.other?.["official-artwork"]?.front_default ??
    data.sprites?.front_default ??
    "";

  const color: string      = speciesData?.color?.name      ?? "";
  const generation: number = speciesData?.generation?.name ? parseGeneration(speciesData.generation.name) : 0;
  const egg_groups: string[] = speciesData?.egg_groups
    ? (speciesData.egg_groups as { name: string }[]).map((g) => g.name)
    : [];

  const result: PokeResult = { id, name: data.name, displayName, types, sprite, color, generation, egg_groups };
  _detailCache.set(id, result);
  return result;
}
