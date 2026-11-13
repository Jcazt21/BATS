import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Flame, Snowflake } from "lucide-react";
import { BackLink } from "@/components/app/BackLink";
import { PageHeader } from "@/components/app/PageHeader";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { BattleDetail } from "@/components/app/BattleDetail";
import { SeasonSelect, type SeasonChoice } from "@/components/app/SeasonSelect";
import { StatTile } from "@/components/app/StatTile";
import { Group, GroupRow } from "@/components/app/Group";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { TypeBadges } from "@/components/app/TypeBadge";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/http";
import type { PlayerProfile } from "@/lib/api";
import { useActiveSeason, useBattleDetails, usePlayerProfile, useSeasons } from "@/lib/queries";
import { fmtDateShort, num, pct } from "@/lib/format";

export function PlayerPage() {
  const { username = "" } = useParams();
  const season = useActiveSeason();
  const seasons = useSeasons();
  const [choice, setChoice] = useState<SeasonChoice>("active");
  const sid = choice === "active" ? season.data?.season_id : choice === "all" ? undefined : choice;
  const q = usePlayerProfile(username, sid);
  const [opened, setOpened] = useState<PlayerProfile["recent"][number] | null>(null);
  const detail = useBattleDetails(opened?.battle_id ?? null);

  const back = <BackLink fallback="/stats">Estadísticas</BackLink>;

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
      <PageHeader
        leading={<PlayerAvatar name={p?.username ?? username} trainer={p?.avatar} size={64} className="text-title3" />}
        eyebrow={choice === "all" ? "Todas las temporadas" : seasons.data?.find((x) => x.season_id === sid)?.season_name ?? season.data?.season_name}
        title={p?.username ?? username}
        subtitle={streak && streak.type && streak.length >= 2 ? (
          <Badge variant={streak.type === "win" ? "success" : "destructive"}>
            {streak.type === "win" ? <Flame /> : <Snowflake />} Racha de {streak.length} {streak.type === "win" ? "victorias" : "derrotas"}
          </Badge>
        ) : undefined}
        actions={seasons.data && seasons.data.length > 0 ? <SeasonSelect seasons={seasons.data} value={choice} onChange={setChoice} /> : undefined}
      />

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
              <GroupRow key={g.battle_id} title={`vs ${g.opponent}`} onClick={() => setOpened(g)}
                subtitle={`${fmtDateShort(g.date)} · ${g.turns} turnos${g.end_type === "forfeit" ? " · abandono" : ""}`}
                trailing={<Badge variant={g.won ? "success" : "destructive"}>{g.won ? "Victoria" : "Derrota"}</Badge>} />
            ))}
        </Group>
      </div>

      <ResponsiveSheet open={!!opened} onOpenChange={(o) => !o && setOpened(null)} className="sm:max-w-3xl"
        title={opened && p ? `${p.username} vs ${opened.opponent}` : ""} description={opened?.date ? fmtDateShort(opened.date) : undefined}>
        {opened && p && (
          <BattleDetail rows={detail.data} loading={detail.isPending} players={[p.username, opened.opponent]} winner={opened.won ? p.username : opened.opponent} />
        )}
      </ResponsiveSheet>

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
