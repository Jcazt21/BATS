import { useEffect, useState } from "react";

/** Ancho de carta en el carrusel móvil: 46vw con tope de 220px. Se mide para que el sprite se escale con el ancho real. */
const MOBILE_CARD_MAX = 220;
function useMobileCardWidth() {
  const calc = () => (typeof window === "undefined" ? MOBILE_CARD_MAX : Math.min(MOBILE_CARD_MAX, Math.round(window.innerWidth * 0.46)));
  const [w, setW] = useState(calc);
  useEffect(() => {
    const onResize = () => setW(calc());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}
import { CardFan } from "@/components/home/CardFan";
import { PokemonHolo } from "@/components/home/PokemonHolo";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { RosterPokemon } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface TeamCardProps {
  pool: RosterPokemon[];
  /** Si ya fijó su alineación, se muestran solo esos; si no, todo el pool. */
  lineupSet?: boolean;
  maxTeamSize?: number;
  season?: string;
  /** Número de Pokédex de una especie (del dex local); `undefined` si no se conoce. */
  dexNum: (species: string) => number | undefined;
  /** Tipo de un movimiento ("Ice"); `undefined` si no se conoce o el dex aún no carga. */
  moveType?: (move: string) => string | undefined;
  /** `spriteid` de Showdown de una especie (forma incluida), para su sprite Gen 5. */
  spriteId?: (species: string) => string | undefined;
  className?: string;
}

/** "Tu equipo": una carta holográfica por pokémon, en abanico (escritorio) o en carrusel (móvil). */
export function TeamCard({ pool, lineupSet, maxTeamSize, season, dexNum, moveType, spriteId, className }: TeamCardProps) {
  const shown = lineupSet ? pool.filter((p) => p.in_lineup) : pool;
  const desktop = useMediaQuery("(min-width: 1024px)");
  const mobileW = useMobileCardWidth();
  return (
    <section
      aria-label="Tu equipo"
      className={cn(
        "flex flex-col overflow-hidden font-card text-[var(--team-text)] lg:min-h-[485px]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 px-7 py-[22px]">
        <div className="flex min-w-0 items-baseline gap-3.5">
          <h2 className="text-2xl font-bold">Tu equipo</h2>
          <span className="truncate font-card-mono text-footnote text-[var(--team-muted)]">
            {shown.length}{maxTeamSize ? `/${maxTeamSize}` : ""}{season ? ` · ${season}` : ""}
          </span>
        </div>
      </header>

      {shown.length > 0 && (
        <div className="flex min-h-0 flex-1 items-center px-4 pb-6 lg:px-0">
          {desktop ? (
            <CardFan count={shown.length} renderCard={(i, w) => <PokemonHolo pokemon={shown[i]} dexNum={dexNum(shown[i].name)} sprite={spriteId?.(shown[i].name)} moveType={moveType} width={w} />} />
          ) : (
            <ul className="-mx-4 flex w-full snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2">
              {shown.map((p) => (
                <li key={p.pokemon_id} className="shrink-0 snap-center" style={{ width: mobileW }}>
                  <PokemonHolo pokemon={p} dexNum={dexNum(p.name)} sprite={spriteId?.(p.name)} moveType={moveType} width={mobileW} idle />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
