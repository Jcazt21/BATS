import type { HoloPokemon } from "@/components/home/PokemonHolo";
import type { PokedexEntry } from "@/lib/api";
import type { Species } from "./snapshot";

/**
 * Datos de la carta holográfica de la ficha de la Pokédex: la especie con el set más usado en la liga
 * (objeto, habilidad y hasta 4 movimientos, de los rosters públicos). Sin datos de la liga, la carta
 * queda limpia con la habilidad principal de la especie.
 */
export function leagueSetCard(species: Species, entry?: PokedexEntry): HoloPokemon {
  const sets = entry?.sets;
  return {
    name: species.name,
    types: species.types.join(" / "),
    held_item: sets?.items[0]?.name ?? null,
    ability: sets?.abilities[0]?.name ?? species.abilities[0] ?? null,
    moves: (sets?.moves ?? []).slice(0, 4).map((m) => m.name),
  };
}
