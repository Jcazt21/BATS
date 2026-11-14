import { useId } from "react";
import { cn } from "@/lib/utils";
import { spriteUrl } from "@/lib/pokemon-types";

interface Props {
  species: string;
  /** `false` = solo la silueta; `true` = el sprite real (con un fundido entre ambos). */
  revealed?: boolean;
  /** Color de relleno de la silueta (cualquier color CSS). Por defecto `--silhouette`, que cambia con el tema. */
  color?: string;
  size?: number;
  className?: string;
}

/**
 * Silueta "¿Quién es ese Pokémon?": rellena con un solo color los píxeles opacos del sprite.
 * Usa un filtro SVG (feFlood + feComposite sobre el alfa) en vez de `mask-image` porque la máscara
 * exige CORS y pokemondb no lo envía; el filtro funciona con cualquier imagen.
 * Ojo: el sprite real se descarga igual, así que no oculta nada a quien inspeccione la red.
 */
export function PokemonSilhouette({ species, revealed = false, color = "var(--silhouette)", size = 96, className }: Props) {
  const filterId = `silhouette-${useId().replace(/:/g, "")}`;
  const url = spriteUrl(species);
  const img = "absolute inset-0 size-full object-contain transition-opacity duration-300";
  return (
    <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <svg aria-hidden width="0" height="0" className="absolute">
        <filter id={filterId} colorInterpolationFilters="sRGB">
          {/* Como propiedad CSS (no atributo) para que acepte var(): el color sigue al tema. */}
          <feFlood style={{ floodColor: color }} />
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </svg>
      <img
        src={url}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn(img, revealed ? "opacity-0" : "opacity-100")}
        style={{ filter: `url(#${filterId})` }}
      />
      <img
        src={url}
        alt={revealed ? species : ""}
        aria-hidden={!revealed || undefined}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn(img, revealed ? "opacity-100" : "opacity-0")}
      />
    </span>
  );
}
