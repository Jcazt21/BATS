import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Flame, Snowflake } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatTile } from "@/components/app/StatTile";
import { Group, GroupRow } from "@/components/app/Group";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { TypeBadges } from "@/components/app/TypeBadge";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/http";
import { useActiveSeason, usePlayerProfile } from "@/lib/queries";
import { fmtDateShort, num, pct } from "@/lib/format";

export function PlayerPage() {
  const { username = "" } = useParams();
  const season = useActiveSeason();
  const q = usePlayerProfile(username, season.data?.season_id);

  const back = (
    <Link to="/stats" className="inline-flex items-center gap-1 text-subhead text-primary hover:underline">
      <ArrowLeft className="size-4" /> Estadísticas
    </Link>
  );

  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex flex-col gap-6">
        {back}
        {notFound ? <EmptyState title="No hay jugador con ese nombre" description="Aún no ha jugado ninguna batalla registrada." /> : <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      </div>
    );
  }

  const p = q.data;
  const streak = p?.streak;
  return (
    <div className="flex flex-col gap-8">
      {back}
      <div className="flex items-center gap-4">
        <PlayerAvatar name={p?.username ?? username} size={64} className="text-title3" />
        <div className="min-w-0">
          <PageHeader eyebrow={season.data?.season_name} title={p?.username ?? username} />
          {streak && streak.type && streak.length >= 2 && (
            <Badge variant={streak.type === "win" ? "success" : "destructive"} className="mt-2">
              {streak.type === "win" ? <Flame /> : <Snowflake />} Racha de {streak.length} {streak.type === "win" ? "victorias" : "derrotas"}
            </Badge>
          )}
        </div>
      </div>

      <section aria-label="Récord" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Récord" value={p ? `${p.record.wins}–${p.record.losses}` : "—"} hint={p ? `${p.record.battles} batallas` : undefined} loading={q.isPending} />
        <StatTile label="Win rate" value={pct(p?.record.win_rate_pct, 1)} loading={q.isPending} />
        <StatTile label="MVP acumulado" value={num(p?.mvp.total, 1)} hint={p ? `${p.mvp.kills} KOs` : undefined} loading={q.isPending} />
        <StatTile label="Rendiciones" value={num(p?.record.forfeits)} hint="batallas abandonadas" loading={q.isPending} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Group title="Pokémon más usados">
          {q.isPending ? <div className="p-4"><Skeleton className="h-28" /></div> : !p?.top_pokemon.length ? <EmptyState title="Sin datos todavía" /> :
            p.top_pokemon.map((m) => (
              <Link key={m.species} to={`/pokedex/${encodeURIComponent(m.species)}`} className="block">
                <GroupRow leading={<PokemonSprite species={m.species} size={44} />} title={m.species}
                  subtitle={`${m.kills} KOs · MVP medio ${num(m.avg_mvp, 1)}`} trailing={<span className="tabular text-subhead font-medium">{m.uses}×</span>} />
              </Link>
            ))}
        </Group>

        <Group title="Últimas batallas">
          {q.isPending ? <div className="p-4"><Skeleton className="h-28" /></div> : !p?.recent.length ? <EmptyState title="Sin batallas" /> :
            p.recent.map((g) => (
              <GroupRow key={g.battle_id} title={`vs ${g.opponent}`}
                subtitle={`${fmtDateShort(g.date)} · ${g.turns} turnos${g.end_type === "forfeit" ? " · abandono" : ""}`}
                trailing={<Badge variant={g.won ? "success" : "destructive"}>{g.won ? "Victoria" : "Derrota"}</Badge>} />
            ))}
        </Group>
      </div>

      {p?.roster && (
        <section className="flex flex-col gap-3">
          <h2 className="text-title3">Equipo · {p.roster.season_name}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {p.roster.pool.map((m) => (
              <li key={m.name} className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
                <div className="flex items-center gap-3">
                  <PokemonSprite species={m.name} src={m.sprite_url} size={48} />
                  <div className="min-w-0">
                    <p className="truncate text-headline">{m.name}</p>
                    <TypeBadges types={m.types} />
                  </div>
                </div>
                {m.held_item && <p className="text-footnote text-muted-foreground">{m.held_item}{m.ability ? ` · ${m.ability}` : ""}</p>}
                {m.moves.length > 0 && <p className="text-caption text-muted-foreground">{m.moves.join(" · ")}</p>}
                {m.in_lineup && <Badge variant="info" className="self-start">En el lineup</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
