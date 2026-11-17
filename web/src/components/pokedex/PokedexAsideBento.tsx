import { PokemonSprite } from "@/components/app/PokemonSprite";
import MagicBento, { type MagicBentoItem } from "@/components/effects/MagicBento";
import type { DexProgress } from "@/lib/dex/collection";
import { haceCuanto } from "@/lib/format";
import { PlayerPicker } from "./PlayerPicker";
import { ProgressCard } from "./ProgressCard";
import { ProgressRing } from "./ProgressRing";

interface Props {
  progress: DexProgress;
  viewing?: string;
  me?: string;
}

/** Panel lateral de la Pokédex en escritorio: selector, anillo con brillo, último descubierto y desglose en MagicBento. */
export function PokedexAsideBento({ progress, viewing, me }: Props) {
  const { last } = progress;

  const items: MagicBentoItem[] = [
    {
      id: "picker",
      label: "Cambiar de jugador",
      content: <PlayerPicker viewing={viewing} me={me} bare />,
    },
    {
      id: "ring",
      label: "Progreso total",
      className: "dex-glow-tile",
      content: (
        <div className="flex justify-center py-1">
          <ProgressRing discovered={progress.discovered} total={progress.total} />
        </div>
      ),
    },
    {
      id: "last",
      label: "Último descubierto",
      content: (
        <div>
          <p className="text-caption uppercase tracking-wide text-muted-foreground">Último descubierto</p>
          {last?.firstSeen ? (
            <div className="mt-2 flex items-center gap-3">
              <PokemonSprite species={last.firstSeen.species} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-subhead font-semibold">{last.species.name}</p>
                <p className="truncate text-footnote text-muted-foreground">
                  {haceCuanto(last.firstSeen.at)} · contra {last.firstSeen.opponent}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-footnote text-muted-foreground">Todavía nada: juega una batalla de liga.</p>
          )}
        </div>
      ),
    },
    {
      id: "breakdown",
      label: "Progreso de la Pokédex",
      content: <ProgressCard progress={progress} bare showLast={false} />,
    },
  ];

  return (
    <MagicBento
      items={items}
      columns={1}
      minColumns={1}
      rowHeight={0}
      gap={12}
      // Mismo brillo neutro que las casillas sin descubrir de la grilla.
      glowColor="var(--muted-foreground)"
      role="group"
      aria-label="Resumen de la Pokédex"
    />
  );
}
