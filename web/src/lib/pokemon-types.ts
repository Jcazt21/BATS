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

/** Tono (hue OKLCH) de cada tipo: de él salen el color del chip y el tinte de la tarjeta. */
export const TYPE_HUE: Record<PokemonType, number> = {
  normal: 75, fire: 40, water: 245, electric: 100, grass: 145, ice: 220,
  fighting: 30, poison: 320, ground: 80, flying: 265, psychic: 350, bug: 125,
  rock: 65, ghost: 300, dragon: 280, dark: 20, steel: 250, fairy: 350,
};

/** Color vivo del tipo (chips, barra superior). Mismo chroma y luminosidad en todos. */
export const typeColor = (t: PokemonType): string => `oklch(0.78 0.11 ${TYPE_HUE[t]})`;
/** Tinte oscuro del tipo para fondos de tarjeta. */
export const typeTint = (t: PokemonType): string => `oklch(0.26 0.04 ${TYPE_HUE[t]})`;

/**
 * Artwork oficial 2D por número de Pokédex (PokeAPI). Las formas alternativas comparten el
 * número de su especie base, así que muestran la forma base.
 */
export function artworkUrl(dexNum: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexNum}.png`;
}

/** Sprite HOME de pokemondb a partir del nombre de especie ("Landorus-Therian"). */
export function spriteUrl(species: string): string {
  const slug = species.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `https://img.pokemondb.net/sprites/home/normal/${slug}.png`;
}
