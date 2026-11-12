import type { PokemonType } from "@/lib/pokemon-types";

/**
 * Fondos de la ventana del artwork: imágenes de 576×324 en `assets/card-backgrounds/<carpeta>/`, una carpeta por tipo
 * (Planta, Bicho y Normal comparten `grass-bug-normal`). Vite las empaqueta con hash, así que son del mismo origen
 * (el canvas puede dibujarlas) y se descubren solas: añadir o quitar PNG no requiere tocar código.
 * De cada tipo solo se sortean las 3 primeras (por nombre de archivo): es lo mínimo que tienen todos los tipos,
 * así que todos reparten igual entre 3 fondos aunque algunas carpetas tengan más.
 */
const POOL = 3;

const files = import.meta.glob<string>("../assets/card-backgrounds/*/*.png", { eager: true, query: "?url", import: "default" });

/** Carpeta de cada tipo; los que no aparecen usan su propio nombre. */
const FOLDER: Partial<Record<PokemonType, string>> = {
  grass: "grass-bug-normal",
  bug: "grass-bug-normal",
  normal: "grass-bug-normal",
};

const byFolder = new Map<string, string[]>();
for (const path of Object.keys(files).sort()) {
  const folder = path.split("/").at(-2)!;
  byFolder.set(folder, [...(byFolder.get(folder) ?? []), files[path]]);
}

/**
 * Fondo de una carta: una de las 3 primeras imágenes de la carpeta del tipo primario, según `roll` (un número
 * al azar en [0, 1) que el llamador sortea una vez por carta, para que no cambie al volver a renderizar).
 * `undefined` sin tipo o sin imágenes.
 */
export function cardBackgroundUrl(type: PokemonType | undefined, roll: number): string | undefined {
  if (!type) return undefined;
  const list = byFolder.get(FOLDER[type] ?? type)?.slice(0, POOL);
  return list?.length ? list[Math.min(list.length - 1, Math.floor(roll * list.length))] : undefined;
}
