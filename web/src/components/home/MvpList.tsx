import { Link } from "react-router-dom";
import { PokemonArtwork } from "@/components/app/PokemonArtwork";
import { ErrorState, LoadingState, EmptyState } from "@/components/app/States";
import { HomeSection } from "@/components/home/HomeSection";
import type { MvpEntry } from "@/lib/api";
import { num } from "@/lib/format";

/** Top 3 de MVP de la temporada: pokémon, quién lo llevó y su puntaje. */
export function MvpList({ query, dexNum }: {
  query: { data?: MvpEntry[]; isPending?: boolean; isError?: boolean; error?: unknown; refetch: () => unknown };
  dexNum: (species: string) => number | undefined;
}) {
  const rows = query.data?.slice(0, 3);
  return (
    <HomeSection title="MVP" to="/stats" linkLabel="Ver más">
      {query.isPending ? <LoadingState rows={3} /> :
        query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> :
        !rows?.length ? <EmptyState title="Aún no hay MVP" description="Se calcula con las batallas de la temporada." /> : (
          <ul className="divide-y divide-border">
            {rows.map((m) => (
              <li key={`${m.species}-${m.player}`}>
                <Link to={`/pokedex/${encodeURIComponent(m.species)}`} className="flex items-center gap-3 rounded-2xl py-2.5 outline-none focus-visible:bg-muted">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary p-1">
                    <PokemonArtwork name={m.species} dexNum={dexNum(m.species)} className="text-caption" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.species}</span>
                    <span className="block truncate text-footnote text-muted-foreground">de {m.player} · {m.total_kills} KOs</span>
                  </span>
                  <span className="font-card-mono text-subhead tabular">{num(Number(m.total_mvp_score), 1)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </HomeSection>
  );
}
