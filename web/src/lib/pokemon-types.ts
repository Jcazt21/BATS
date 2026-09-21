/**
 * Tipos Pokémon: un único sitio. Los colores viven en styles/tokens.css como utilidades
 * `type-<slug>` (fondo + texto con contraste AA).
 */
export const POKEMON_TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;

export type PokemonType = (typeof POKEMON_TYPES)[number];

const LABELS: Record<PokemonType, string> = {
  normal: "Normal", fire: "Fuego", water: "Agua", electric: "Eléctrico", grass: "Planta", ice: "Hielo",
  fighting: "Lucha", poison: "Veneno", ground: "Tierra", flying: "Volador", psychic: "Psíquico", bug: "Bicho",
  rock: "Roca", ghost: "Fantasma", dragon: "Dragón", dark: "Siniestro", steel: "Acero", fairy: "Hada",
};

export function isPokemonType(v: string): v is PokemonType {
  return (POKEMON_TYPES as readonly string[]).includes(v);
}

export function typeLabel(t: PokemonType): string {
  return LABELS[t];
}

/** "Ice / Flying" → ["ice", "flying"] */
export function parseTypes(types: string | null | undefined): PokemonType[] {
  if (!types) return [];
  return types
    .split("/")
    .map((t) => t.trim().toLowerCase())
    .filter(isPokemonType);
}

/** Sprite HOME de pokemondb a partir del nombre de especie ("Landorus-Therian"). */
export function spriteUrl(species: string): string {
  const slug = species.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `https://img.pokemondb.net/sprites/home/normal/${slug}.png`;
}
