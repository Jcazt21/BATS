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

/** Sprite con reserva de espacio (sin saltos de layout) y silueta si la imagen falla. */
export function PokemonSprite({ species, src, size = 48, className }: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <span aria-hidden className="size-2/3 rounded-full bg-muted" />
      ) : (
        <img
          src={src || spriteUrl(species)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="object-contain"
          style={{ width: size, height: size }}
        />
      )}
    </span>
  );
}
