import { useState } from "react";
import { artworkUrl } from "@/lib/pokemon-types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Artwork oficial 2D de una especie. Sin número de Pokédex o si la imagen falla, cae a un
 * círculo con las iniciales (el nombre sigue siendo texto real en el resto de la tarjeta).
 */
export function PokemonArtwork({ name, dexNum, className }: { name: string; dexNum?: number | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!dexNum || failed) {
    return (
      <span aria-hidden="true" className={cn("grid aspect-square w-1/2 max-w-24 place-items-center rounded-full bg-white/10 text-title3 font-bold text-white/70", className)}>
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      src={artworkUrl(dexNum)}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn("size-full object-contain", className)}
    />
  );
}
