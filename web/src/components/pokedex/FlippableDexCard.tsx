import { useMemo, useState } from "react";
import { RotateCw } from "lucide-react";
import { CARD_RATIO } from "@/components/home/CardFan";
import { PokemonHolo } from "@/components/home/PokemonHolo";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { PokedexEntry } from "@/lib/api";
import type { DexCell } from "@/lib/dex/collection";
import { leagueSetCard } from "@/lib/dex/league-set";
import type { CellPlayerStats } from "@/lib/dex/player-stats";
import type { Species } from "@/lib/dex/snapshot";
import { fmtDate, num } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FlippableDexCardProps {
  cell: DexCell;
  species: Species;
  entry: PokedexEntry | undefined;
  playerStats: CellPlayerStats;
  isOwn: boolean;
  width: number;
  moveType: (move: string) => string | undefined;
}

/** Origen del descubrimiento: visto en batalla (rival y fecha) o por evolución. */
function origin(cell: DexCell): string {
  if (cell.status === "evolution") return `Descubierto al ver a ${cell.via}`;
  const f = cell.firstSeen;
  return f ? `Visto en batalla contra ${f.opponent} · ${fmtDate(f.at)}` : "Visto en batalla";
}

/**
 * Carta holográfica que gira en 3D (<= 300 ms, sin animación bajo `prefers-reduced-motion`):
 *   - Frente: set más usado en la liga (`PokemonHolo`).
 *   - Reverso: historia del jugador con el pokémon (avistamiento, mejor batalla, formas y habilidades).
 */
export function FlippableDexCard({ cell, species, entry, playerStats, isOwn, width, moveType }: FlippableDexCardProps) {
  const [flipped, setFlipped] = useState(false);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const card = useMemo(() => leagueSetCard(species, entry), [species, entry]);
  const players = entry?.sets.players ?? 0;
  const radius = Math.round(width * 0.044);
  const best = playerStats.kind === "used" ? playerStats.best : null;
  const hint = flipped
    ? "Toca para ver el set"
    : isOwn
      ? "Toca para ver tu historia"
      : "Toca para ver su historia";

  return (
    <figure className="flex flex-col items-center gap-1.5" style={{ width }}>
      <button
        type="button"
        aria-pressed={flipped}
        aria-label={flipped ? "Ver set de la liga" : hint}
        onClick={() => setFlipped((f) => !f)}
        className="group flex min-h-11 w-full cursor-pointer flex-col items-center gap-2 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
      >
        <div className="w-full" style={{ width, aspectRatio: CARD_RATIO, perspective: "1000px" }}>
          <div
            className={cn(
              "relative size-full [transform-style:preserve-3d]",
              !reduceMotion && "transition-transform duration-300 ease-ios",
            )}
            style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
          >
            <div
              aria-hidden={flipped}
              className={cn(
                "absolute inset-0 [backface-visibility:hidden]",
                flipped && "pointer-events-none",
              )}
            >
              <PokemonHolo
                pokemon={card}
                dexNum={cell.num}
                sprite={species.spriteid}
                moveType={moveType}
                width={width}
              />
            </div>

            <div
              aria-hidden={!flipped}
              style={{ borderRadius: radius }}
              className={cn(
                "absolute inset-0 flex flex-col gap-2 overflow-y-auto border border-primary/50 bg-card p-3.5 text-card-foreground shadow-md [backface-visibility:hidden] [transform:rotateY(180deg)]",
                !flipped && "pointer-events-none",
              )}
            >
              <p className="text-caption font-semibold uppercase tracking-wide text-primary">
                {isOwn ? `Tu ${species.name}` : `Su ${species.name}`}
              </p>

              <p className="text-caption leading-snug text-foreground">{origin(cell)}</p>

              {best && (
                <div className="border-t border-border pt-2">
                  <p className="text-caption text-muted-foreground">
                    {isOwn ? "Tu mejor batalla" : "Su mejor batalla"}
                  </p>
                  <p className="mt-0.5 font-card-mono text-footnote font-semibold tabular text-foreground">
                    {best.kills} {best.kills === 1 ? "KO" : "KOs"} · MVP {num(best.mvp, 2)}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    vs {best.opponent} · {fmtDate(best.date)}
                  </p>
                </div>
              )}

              {(cell.seenForms.length > 0 || species.abilities.length > 0) && (
                <div className="mt-auto flex flex-col gap-1 border-t border-border pt-2 text-caption">
                  {cell.seenForms.length > 0 && (
                    <p className="leading-snug">
                      <span className="text-muted-foreground">Formas vistas: </span>
                      <span>{cell.seenForms.join(", ")}</span>
                    </p>
                  )}
                  {species.abilities.length > 0 && (
                    <p className="leading-snug">
                      <span className="text-muted-foreground">Habilidades: </span>
                      <span>{species.abilities.join(", ")}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 text-caption font-medium text-primary">
          <RotateCw
            className={cn(
              "size-3 shrink-0",
              !reduceMotion && "transition-transform duration-200 group-hover:rotate-45",
            )}
            aria-hidden="true"
          />
          <span>{hint}</span>
        </span>
      </button>

      <figcaption className="text-center text-caption text-muted-foreground">
        {players > 0
          ? `Set más usado en la liga · ${players} ${players === 1 ? "jugador" : "jugadores"}`
          : "Todavía sin sets públicos en la liga"}
      </figcaption>
    </figure>
  );
}
