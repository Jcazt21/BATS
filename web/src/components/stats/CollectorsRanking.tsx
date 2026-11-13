import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Meter } from "@/components/app/Meter";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/States";
import MagicBento from "@/components/effects/MagicBento";
import { buildCollection, collectionProgress, type DexProgress } from "@/lib/dex/collection";
import { useCollectors, useDexEssentials } from "@/lib/queries";

interface RankedCollector {
  username: string;
  progress: DexProgress;
}

export function CollectorsRanking() {
  const collectors = useCollectors();
  const dex = useDexEssentials();

  const rows = useMemo<RankedCollector[]>(() => {
    if (!dex.data || !collectors.data) return [];
    return collectors.data
      .map((entry) => ({
        username: entry.username,
        progress: collectionProgress(buildCollection(dex.data, entry.seen)),
      }))
      .sort(
        (a, b) =>
          b.progress.discovered - a.progress.discovered ||
          b.progress.seen - a.progress.seen ||
          a.username.localeCompare(b.username, "es"),
      );
  }, [collectors.data, dex.data]);

  const loading = collectors.isPending || dex.isPending;
  const error = collectors.isError ? collectors.error : dex.isError ? dex.error : null;

  const content = loading ? (
    <LoadingState rows={4} />
  ) : error ? (
    <ErrorState
      error={error}
      onRetry={() => {
        if (collectors.isError) void collectors.refetch();
        if (dex.isError) void dex.refetch();
      }}
    />
  ) : rows.length === 0 ? (
    <EmptyState title="Nadie ha descubierto pokémon todavía" />
  ) : (
    <ol aria-label="Ranking de coleccionistas" className="divide-y divide-border">
      {rows.map(({ username, progress }, index) => {
        const position = index + 1;
        const lastSpecies = progress.last?.firstSeen?.species ?? progress.last?.species.name;
        const lastName = progress.last?.species.name;
        return (
          <li key={username}>
            <Link
              to={`/j/${encodeURIComponent(username)}/pokedex`}
              className="flex min-h-11 items-center gap-3 rounded-2xl px-2 py-2.5 outline-none transition-colors duration-200 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="w-6 shrink-0 text-right font-card-mono text-subhead text-muted-foreground tabular">
                <span className="sr-only">Posición </span>
                {position}
              </span>
              <PlayerAvatar name={username} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{username}</span>
                  <span className="shrink-0 font-card-mono text-subhead tabular">
                    {progress.discovered}{" "}
                    <span className="text-muted-foreground">/ {progress.total}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <Meter
                    value={progress.discovered}
                    max={progress.total}
                    label={`Pokédex de ${username}: ${progress.discovered} de ${progress.total}`}
                    className="flex-1"
                  />
                  {lastName && (
                    <span className="inline-flex max-w-[10rem] shrink-0 items-center gap-1.5 truncate text-footnote text-muted-foreground">
                      {lastSpecies && <PokemonSprite species={lastSpecies} size={20} />}
                      <span className="truncate">Último: {lastName}</span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-footnote text-muted-foreground">
        La Pokédex es por cuenta: no cambia con la temporada.
      </p>
      <MagicBento
        columns={1}
        rowHeight={120}
        items={[
          {
            id: "collectors-ranking",
            label: "Ranking de coleccionistas",
            content,
          },
        ]}
      />
    </div>
  );
}
