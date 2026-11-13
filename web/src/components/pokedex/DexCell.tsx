import { Eye, GitBranch } from "lucide-react";
import { PokemonSilhouette } from "@/components/app/PokemonSilhouette";
import type { DexCell as Cell } from "@/lib/dex/collection";
import { dexNumber } from "@/lib/dex/collection";
import { cn } from "@/lib/utils";

/**
 * Casilla de la Pokédex: silueta arriba, número abajo. Descubierta = sprite, nombre y un
 * indicador sutil del origen (visto en batalla / por evolución). Solo las descubiertas se abren.
 */
export function DexCell({ cell, onOpen }: { cell: Cell; onOpen: (cell: Cell) => void }) {
  const discovered = cell.status !== "unknown";
  const body = (
    <>
      {cell.status === "seen" && (
        <Eye aria-label="Visto en batalla" className="absolute top-2 right-2 size-3.5 text-muted-foreground" />
      )}
      {cell.status === "evolution" && (
        <GitBranch aria-label="Descubierto por evolución" className="absolute top-2 right-2 size-3.5 text-muted-foreground" />
      )}
      <PokemonSilhouette species={cell.species.name} revealed={discovered} size={72} />
      <span className="font-mono text-footnote text-muted-foreground tabular">{dexNumber(cell.num)}</span>
      <span className="w-full truncate text-center text-subhead font-medium">{discovered ? cell.species.name : "???"}</span>
    </>
  );
  const base = "relative flex flex-col items-center gap-1 rounded-2xl border bg-card p-3 [content-visibility:auto] [contain-intrinsic-size:auto_9.5rem]";

  if (!discovered) {
    return <div className={base} aria-label={`${dexNumber(cell.num)} sin descubrir`}>{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(cell)}
      aria-label={`${dexNumber(cell.num)} ${cell.species.name}`}
      className={cn(base, "press shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring outline-none")}
    >
      {body}
    </button>
  );
}
