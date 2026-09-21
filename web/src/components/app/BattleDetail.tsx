import { Trophy } from "lucide-react";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { BattleDetailEntry } from "@/lib/api";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

function Team({ name, won, rows }: { name: string; won: boolean; rows: BattleDetailEntry[] }) {
  const top = Math.max(0, ...rows.map((r) => Number(r.mvp_score)));
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={`Equipo de ${name}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-headline">{name}</h3>
        <Badge variant={won ? "success" : "secondary"}>{won ? "Ganó" : "Perdió"}</Badge>
      </div>
      <ul className="flex flex-col gap-1.5">
        {rows.map((m) => {
          const mvp = top > 0 && Number(m.mvp_score) === top;
          return (
            <li key={m.species} className={cn("flex items-center gap-3 rounded-xl bg-secondary/60 p-2", mvp && "ring-1 ring-warning/60", !m.survived && "opacity-70")}>
              <PokemonSprite species={m.species} size={40} className={cn(!m.survived && "grayscale")} />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-subhead font-medium", !m.survived && "line-through")}>{m.species}</span>
                <span className="block text-caption text-muted-foreground">{m.kills} KOs{m.final_hit ? " · golpe final" : ""}{!m.survived ? " · debilitado" : ""}</span>
              </span>
              <span className={cn("tabular flex items-center gap-1 text-subhead font-medium", mvp && "text-warning")}>
                {mvp && <Trophy className="size-3.5" />}{num(Number(m.mvp_score), 1)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Los dos equipos de una batalla con sus MVP. `players` fija el orden (izquierda / derecha). */
export function BattleDetail({ rows, players, winner, loading }: {
  rows: BattleDetailEntry[] | undefined; players: [string, string]; winner: string | null; loading?: boolean;
}) {
  if (loading || !rows) return <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>;
  // La banca no juega: solo pokémon que salieron (mvp_score > 0 o algún KO/turno)
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {players.map((p) => (
        <Team key={p} name={p} won={winner === p} rows={rows.filter((r) => r.player === p).sort((a, b) => Number(b.mvp_score) - Number(a.mvp_score))} />
      ))}
    </div>
  );
}
