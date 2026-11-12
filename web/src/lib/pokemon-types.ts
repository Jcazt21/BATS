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
 * Colores de las cartas del equipo: mismo matiz que `typeColor`, pero mucho más croma y luminosidad,
 * para un fondo vivo. Degradado de tres paradas (arriba, media, abajo): arriba lleva el nombre en
 * texto oscuro; media y abajo llevan texto blanco, y por eso son más oscuras.
 * Los tests fijan el contraste mínimo de cada tramo con su texto.
 */
export const cardColor = (t: PokemonType): string => `oklch(0.72 0.19 ${TYPE_HUE[t]})`;
export const cardMid = (t: PokemonType): string => `oklch(0.5 0.17 ${TYPE_HUE[t]})`;
export const cardTint = (t: PokemonType): string => `oklch(0.32 0.11 ${TYPE_HUE[t]})`;

/** Estilo de sprite: modelos 3D (Gen 6+) o pixel art de Blanco/Negro. */
export type SpriteStyle = "3d" | "gen5";

/**
 * Sprite de una especie, servido por el API de BATS (que lo toma de Showdown y sabe cuáles tienen animación):
 * GIF animado si existe, PNG estático si no (o con `still`). `spriteId` sale del dex ("scizor-mega").
 * Sin `style` el API usa 3D.
 */
export function spritePath(spriteId: string, { still = false, style }: { still?: boolean; style?: SpriteStyle } = {}): string {
  const query = [style && `style=${style}`, still && "still=1"].filter(Boolean).join("&");
  return `/api/sprites/${encodeURIComponent(spriteId)}${query ? `?${query}` : ""}`;
}

/**
 * Artwork oficial 2D por número de Pokédex (PokeAPI). Las formas alternativas comparten el
 * número de su especie base, así que muestran la forma base.
 */
export function artworkUrl(dexNum: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexNum}.png`;
}

/** Id de cada tipo en PokeAPI (de ahí salen los iconos). */
export const TYPE_ID: Record<PokemonType, number> = {
  normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6, bug: 7, ghost: 8, steel: 9,
  fire: 10, water: 11, grass: 12, electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
};

/** Icono cuadrado (60×60, glifo del tipo sobre su color) de Escarlata/Púrpura, de PokeAPI. */
export function typeIconUrl(t: PokemonType): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet/small/${TYPE_ID[t]}.png`;
}

/** Sprite HOME de pokemondb a partir del nombre de especie ("Landorus-Therian"). */
export function spriteUrl(species: string): string {
  const slug = species.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `https://img.pokemondb.net/sprites/home/normal/${slug}.png`;
}
