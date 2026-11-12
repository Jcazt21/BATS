import { apiUrl, request } from "@/lib/http";
import { spritePath, type SpriteStyle } from "@/lib/pokemon-types";

/**
 * Estilo de sprite de las cartas. Por defecto 3D; `VITE_SPRITE_STYLE=gen5` vuelve al pixel art de Blanco/Negro
 * (p. ej. `VITE_SPRITE_STYLE=gen5 npm run dev:mock`) para comparar.
 */
export const SPRITE_STYLE: SpriteStyle = import.meta.env.VITE_SPRITE_STYLE === "gen5" ? "gen5" : "3d";

/** Lado del PNG estático de cada estilo (cuadrado). */
const STILL_SIZE: Record<SpriteStyle, number> = { "3d": 120, gen5: 96 };

/** Sprite que se pinta como `<img>` encima de la carta. */
export interface OverlaySprite {
  url: string;
  /** Tamaño natural en píxeles (el GIF viene recortado a lo opaco; el PNG estático es cuadrado). */
  w: number;
  h: number;
  animated: boolean;
  /** Pixel art: se escala con píxeles enteros y sin suavizado. Los renders 3D se escalan suavemente. */
  pixelated: boolean;
}

interface SpriteInfo {
  animated: boolean;
  width: number;
  height: number;
}

const cache = new Map<string, Promise<OverlaySprite | null>>();

/** Carga la imagen entera antes de mostrarla (sin saltos); `false` si falla. */
function preload(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function resolve(spriteId: string, animate: boolean, style: SpriteStyle): Promise<OverlaySprite | null> {
  try {
    // El API sabe cuáles especies tienen animación: no se prueba un GIF para caer al PNG tras un 404.
    const size = STILL_SIZE[style];
    const info = animate
      ? await request<SpriteInfo>(`/api/sprites/${encodeURIComponent(spriteId)}/info?style=${style}`)
      : { animated: false, width: size, height: size };
    const url = apiUrl(spritePath(spriteId, { still: !info.animated, style }));
    return (await preload(url)) ? { url, w: info.width, h: info.height, animated: info.animated, pixelated: style === "gen5" } : null;
  } catch {
    return null; // API caída o especie desconocida: la carta usa el artwork de reserva
  }
}

/**
 * Sprite de una especie, consumido del API de BATS: animado si existe (y se permite el movimiento), estático
 * si no. Va en una `<img>` y no en el canvas porque un GIF no se anima dentro de un canvas.
 * `null` si no hay sprite ni API.
 */
export function resolveOverlaySprite(spriteId: string, { animate, style = SPRITE_STYLE }: { animate: boolean; style?: SpriteStyle }): Promise<OverlaySprite | null> {
  const key = `${style}:${animate ? "a" : "s"}:${spriteId}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = resolve(spriteId, animate, style);
    cache.set(key, hit);
  }
  return hit;
}
