/**
 * Qué rutas son "la misma página" para la transición y el scroll. La ficha de la Pokédex es un
 * modal con URL propia (/pokedex/:species, /j/:username/pokedex/:species): abrirla no debe
 * remontar, animar ni subir la grilla que queda debajo.
 */
const POKEDEX_ENTRY = /^((?:\/j\/[^/]+)?\/pokedex)\/[^/]+$/;

export function pageKey(pathname: string): string {
  return pathname.match(POKEDEX_ENTRY)?.[1] ?? pathname;
}
