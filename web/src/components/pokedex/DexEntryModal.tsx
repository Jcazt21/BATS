import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { TypeBadges } from "@/components/app/TypeBadge";
import { useMediaQuery } from "@/hooks/use-media-query";
import { dexNumber, type DexCell } from "@/lib/dex/collection";
import { aggregateCellPlayerStats } from "@/lib/dex/player-stats";
import { speciesById, toId } from "@/lib/dex/snapshot";
import { useDexDetails, useDexEssentials, usePlayerPokedexStats, usePokemonStatsEntry } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { EntryBento } from "./EntryBento";
import { FlippableDexCard } from "./FlippableDexCard";

export interface DexEntryModalProps {
  cell: DexCell;
  onClose: () => void;
  username?: string;
  isOwn?: boolean;
}

function EntryBody({
  cell,
  username,
  isOwn,
  wide,
}: {
  cell: DexCell;
  username?: string;
  isOwn: boolean;
  wide: boolean;
}) {
  const dex = useDexEssentials();
  const details = useDexDetails();
  // En la liga se juega la forma (Charizard-Mega-Y, Scizor-Mega): la carta, las stats base y el torneo
  // son de la forma vista primero; sin avistamiento propio (por evolución), de la especie base.
  const sp = (cell.firstSeen && dex.data && speciesById(dex.data, cell.firstSeen.species)) || cell.species;
  const leagueStats = usePokemonStatsEntry(sp.name);
  const playerStatsQuery = usePlayerPokedexStats(username);
  const playerStats = useMemo(
    () => aggregateCellPlayerStats(dex.data, cell.num, playerStatsQuery.data, cell.status),
    [dex.data, cell.num, playerStatsQuery.data, cell.status],
  );
  const playerStatsLoading = cell.status === "seen" && !!username && !!playerStatsQuery.isPending;
  const moveType = useCallback((move: string) => details.data?.moves[toId(move)]?.type, [details.data]);

  const card = (
    <FlippableDexCard
      key={cell.num}
      cell={cell}
      species={sp}
      entry={leagueStats.data}
      playerStats={playerStats}
      isOwn={isOwn}
      width={wide ? 184 : 170}
      moveType={moveType}
    />
  );

  const bento = (
    <EntryBento
      key={cell.num}
      species={sp}
      cellStatus={cell.status}
      playerStats={playerStats}
      playerStatsLoading={playerStatsLoading}
      leagueStats={leagueStats}
      isOwn={isOwn}
      wide={wide}
    />
  );

  const link = (
    <Link
      to={`/stats/pokemon/${encodeURIComponent(sp.name)}`}
      className={cn(
        "inline-flex items-center gap-1 self-start text-footnote font-medium text-primary hover:underline",
        !wide && "min-h-11",
      )}
    >
      <span>Ver estadísticas completas</span>
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );

  if (!wide) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-card-mono text-footnote text-muted-foreground tabular">{dexNumber(cell.num)}</span>
          <TypeBadges types={sp.types.join(" / ")} />
        </div>
        <div className="flex justify-center">{card}</div>
        {bento}
        {link}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
      <div className="flex justify-center">{card}</div>
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="pr-7">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-card-mono text-footnote text-muted-foreground tabular">{dexNumber(cell.num)}</span>
            <h2 className="text-headline font-semibold text-foreground">{sp.name}</h2>
          </div>
          <TypeBadges types={sp.types.join(" / ")} className="mt-1" />
        </div>
        {bento}
        {link}
      </div>
    </div>
  );
}

/**
 * Ficha de una casilla descubierta, sobre la grilla: carta holográfica que gira hacia la historia
 * del jugador y mosaicos bento compactos a la derecha (hoja inferior en teléfono).
 */
export function DexEntryModal({ cell, onClose, username, isOwn = true }: DexEntryModalProps) {
  const wide = useMediaQuery("(min-width: 768px)");
  return (
    <ResponsiveSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={cell.species.name}
      className="sm:max-w-[600px] [&_[data-slot=dialog-header]]:sr-only"
    >
      <EntryBody cell={cell} username={username} isOwn={isOwn} wide={wide} />
    </ResponsiveSheet>
  );
}
