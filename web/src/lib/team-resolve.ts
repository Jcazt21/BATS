import type { PokemonPayload } from "@/lib/api";
import { getPokemonDetail, loadAllPokemon, searchPokemon, type PokeResult } from "@/lib/pokeapi";
import { pokeapiSlug, type ShowdownPokemon } from "@/lib/showdown";

/** Busca la especie en PokéAPI: primero el nombre exacto y, si es una forma rara, la especie base. */
export async function lookupSpecies(species: string): Promise<PokeResult | null> {
  await loadAllPokemon();
  const slug = pokeapiSlug(species);
  const base = slug.replace(/-[a-z]+(-[a-z]+)?$/, "");
  const hit =
    searchPokemon(slug, 60).find((p) => p.name === slug) ??
    searchPokemon(base, 60).find((p) => p.name === base) ??
    searchPokemon(slug, 1)[0];
  return hit ? getPokemonDetail(hit.id) : null;
}

type SetLike = {
  held_item?: string | null; ability?: string | null; nature?: string | null; tera_type?: string | null;
  moves?: string[]; evs?: Record<string, number>; ivs?: Record<string, number>;
};

export function toPayload(sd: SetLike, info: PokeResult, name?: string): PokemonPayload {
  return {
    name: name ?? info.displayName,
    national_dex: info.id,
    types: info.types,
    sprite_url: info.sprite,
    held_item: sd.held_item ?? null,
    ability: sd.ability ?? null,
    nature: sd.nature ?? null,
    tera_type: sd.tera_type ?? null,
    moves: sd.moves ?? [],
    evs: sd.evs ?? {},
    ivs: sd.ivs ?? {},
    color: info.color || null,
    generation: info.generation || null,
    egg_groups: info.egg_groups,
  };
}

export interface ParsedMon { source: ShowdownPokemon; payload: PokemonPayload | null }

/** Resuelve un paste completo contra PokéAPI en paralelo. `payload` es null si la especie no existe. */
export async function resolvePaste(mons: ShowdownPokemon[]): Promise<ParsedMon[]> {
  return Promise.all(
    mons.map(async (source) => {
      const info = await lookupSpecies(source.species).catch(() => null);
      return { source, payload: info ? toPayload(source, info, source.species) : null };
    }),
  );
}
