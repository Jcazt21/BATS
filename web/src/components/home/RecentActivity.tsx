import { Link } from "react-router-dom";
import { ErrorState, LoadingState, EmptyState } from "@/components/app/States";
import { HomeSection } from "@/components/home/HomeSection";
import type { RecentBattle } from "@/lib/api";
import { haceCuanto } from "@/lib/format";

/** Feed de las últimas batallas entre jugadores. */
export function RecentActivity({ query }: {
  query: { data?: RecentBattle[]; isPending?: boolean; isError?: boolean; error?: unknown; refetch: () => unknown };
}) {
  const rows = query.data?.slice(0, 4);
  return (
    <HomeSection title="Actividad" to="/stats" linkLabel="Todas">
      {query.isPending ? <LoadingState rows={4} /> :
        query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> :
        !rows?.length ? <EmptyState title="Aún no hay batallas" description="Aparecerán cuando se jueguen." /> : (
          <ul className="divide-y divide-border">
            {rows.map((b) => (
              <li key={b.battle_id} className="py-2.5">
                {b.winner && b.loser ? (
                  <p>
                    <Player name={b.winner} strong /> <span className="text-footnote text-muted-foreground">venció a</span> <Player name={b.loser} />
                  </p>
                ) : (
                  <p><Player name={b.players[0]} strong /> <span className="text-footnote text-muted-foreground">empató con</span> <Player name={b.players[1]} /></p>
                )}
                <p className="text-footnote text-muted-foreground">{b.turns} turnos · {haceCuanto(b.date)}</p>
              </li>
            ))}
          </ul>
        )}
    </HomeSection>
  );
}

function Player({ name, strong }: { name: string; strong?: boolean }) {
  return (
    <Link to={`/j/${encodeURIComponent(name)}`} className={`rounded outline-none focus-visible:ring-2 focus-visible:ring-ring ${strong ? "font-semibold" : ""}`}>
      {name}
    </Link>
  );
}
