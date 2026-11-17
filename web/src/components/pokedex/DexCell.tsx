import type { CSSProperties } from "react";
import { Eye, GitBranch } from "lucide-react";
import { PokemonSilhouette } from "@/components/app/PokemonSilhouette";
import { cellTypeVar, dexNumber, isNewDiscovery, type DexCell as Cell } from "@/lib/dex/collection";
import { cn } from "@/lib/utils";
import "./DexCell.css";

/**
 * Casilla de la Pokédex: silueta arriba, número abajo. Descubierta = halo radial de su tipo
 * principal, sprite, nombre, indicador de origen (visto / evolución) y etiqueta "NUEVO" si se
 * descubrió en los últimos 7 días. Sin descubrir = silueta más apagada y oscura.
 */
/**
 * `inBento`: la casilla vive dentro de una tarjeta de `MagicBento`, que ya pone superficie, borde,
 * luz y brillo; la casilla solo aporta el halo del tipo y el contenido.
 */
export function DexCell({ cell, onOpen, compact = false, inBento = false }: { cell: Cell; onOpen: (cell: Cell) => void; compact?: boolean; inBento?: boolean }) {
  const discovered = cell.status !== "unknown";
  const isNew = discovered && isNewDiscovery(cell);
  const typeVar = cellTypeVar(cell);

  const body = (
    <>
      {isNew && (
        <span className="absolute top-2 left-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-wide text-primary-foreground">
          NUEVO
        </span>
      )}
      {cell.status === "seen" && (
        <Eye aria-label="Visto en batalla" className="absolute top-2 right-2 size-3.5 text-muted-foreground" />
      )}
      {cell.status === "evolution" && (
        <GitBranch aria-label="Descubierto por evolución" className="absolute top-2 right-2 size-3.5 text-muted-foreground" />
      )}
      <PokemonSilhouette
        species={cell.species.name}
        revealed={discovered}
        size={compact ? 52 : 72}
        className={discovered ? undefined : "opacity-45"}
      />
      <span className="font-mono text-footnote text-muted-foreground tabular">{dexNumber(cell.num)}</span>
      <span
        className={cn(
          "w-full truncate text-center font-medium",
          compact ? "text-footnote" : "text-subhead",
          !discovered && "text-muted-foreground/60",
        )}
      >
        {discovered ? cell.species.name : "???"}
      </span>
    </>
  );

  const base = cn(
    "relative flex size-full min-h-11 min-w-0 flex-col items-center gap-1 overflow-hidden [content-visibility:auto] [contain-intrinsic-size:auto_9.5rem]",
    !inBento && "rounded-2xl border",
    compact ? "p-2" : "p-3",
  );

  if (!discovered) {
    return (
      <div
        className={cn(base, !inBento && "border-border/60 bg-muted/45 dark:bg-background/70")}
        aria-label={`${dexNumber(cell.num)} sin descubrir`}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(cell)}
      aria-label={`${dexNumber(cell.num)} ${cell.species.name}`}
      style={{ "--cell-type": typeVar } as CSSProperties}
      className={cn(
        base,
        "dex-cell-discovered outline-none focus-visible:ring-2 focus-visible:ring-ring",
        inBento ? "dex-cell-in-bento focus-visible:ring-inset" : "bg-card shadow-sm",
      )}
    >
      {body}
    </button>
  );
}
