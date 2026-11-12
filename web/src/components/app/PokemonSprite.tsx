import { useState } from "react";
import { cn } from "@/lib/utils";
import { spriteUrl } from "@/lib/pokemon-types";

interface Props {
  species: string;
  /** URL explícita (p. ej. la de pokemon_cache); si falta se deduce de la especie. */
  src?: string | null;
  size?: number;
  className?: string;
}

/** Sprite con reserva de espacio (sin saltos de layout), fundido al cargar y silueta si la imagen falla. */
export function PokemonSprite({ species, src, size = 48, className }: Props) {
  const [failed, setFailed] = useState(false);
  // pokemondb no tiene sprite HOME para las formas Gigantamax: se reintenta con la forma base.
  const [fallback, setFallback] = useState(false);
  const url = src || spriteUrl(fallback ? species.replace(/-gmax$/i, "") : species);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <span aria-hidden className="size-2/3 rounded-full bg-muted" />
      ) : (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => (!fallback && !src && /-gmax$/i.test(species) ? setFallback(true) : setFailed(true))}
          // Aparece con un fundido al terminar de descargar, no a trozos ni de golpe.
          onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "")}
          className="object-contain opacity-0 transition-opacity duration-300 data-loaded:opacity-100"
          style={{ width: size, height: size }}
        />
      )}
    </span>
  );
}
