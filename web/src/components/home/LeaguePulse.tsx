import { Link } from "react-router-dom";
import type { LeagueSummary } from "@/lib/api";
import { num, pct } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

/** Cuatro cifras de la liga en una fila, sin cajas. Cada una lleva a /stats. */
export function LeaguePulse({ summary, loading }: { summary?: LeagueSummary; loading?: boolean }) {
  const items: [string, string][] = [
    ["Batallas", num(summary?.total_battles)],
    ["Jugadores", num(summary?.total_players)],
    ["Turnos por batalla", num(summary?.avg_turns, 1)],
    ["Mejor win rate", pct(summary?.top_win_rate, 1)],
  ];
  return (
    <section aria-label="Resumen" className="grid grid-cols-2 gap-y-6 md:grid-cols-4 md:divide-x md:divide-border">
      {items.map(([label, value]) => (
        <Link key={label} to="/stats" className="press rounded-xl px-5 py-1 outline-none first:pl-0 focus-visible:ring-2 focus-visible:ring-ring md:first:pl-0">
          {loading ? <Skeleton className="h-9 w-20" /> : <p className="font-card-mono text-[30px] font-medium leading-none tabular">{value}</p>}
          <p className="mt-1 text-footnote text-muted-foreground">{label}</p>
        </Link>
      ))}
    </section>
  );
}
