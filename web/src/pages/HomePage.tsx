import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, ShieldBan, Trophy, Users } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatTile } from "@/components/app/StatTile";
import { Group, GroupRow } from "@/components/app/Group";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { TypeBadges } from "@/components/app/TypeBadge";
import { Meter } from "@/components/app/Meter";
import { ErrorState } from "@/components/app/States";
import { HomePillar } from "@/components/home/HomePillar";
import { Onboarding } from "@/components/home/Onboarding";
import { PersonalCard } from "@/components/home/PersonalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveSeason, useBanStatus, useLeaderboard, useMvp, useSummary } from "@/lib/queries";
import { num, pct } from "@/lib/format";
import { parseTypes, typeLabel } from "@/lib/pokemon-types";
import { cn } from "@/lib/utils";

export function HomePage() {
  const season = useActiveSeason();
  const summary = useSummary();
  const leaderboard = useLeaderboard();
  const mvp = useMvp();
  const ban = useBanStatus();
  const closed = !!season.data?.restrictions?.registration_closed;
  // "ice" → "Hielo": el título habla en español como el resto de la UI.
  const tipoDelMes = parseTypes(season.data?.type_of_month).map(typeLabel).join(" / ") || season.data?.type_of_month;

  return (
    <div className="flex flex-col gap-8">
      <div className="relative">
        <HomePillar />
        <PageHeader
          eyebrow={season.data ? `${season.data.season_name} · Tipo del mes` : "PinchesGueys League"}
          title={tipoDelMes ? `Temporada de ${tipoDelMes}` : "PinchesGueys League"}
          subtitle={season.data?.type_of_month ? <TypeBadges types={season.data.type_of_month} /> : undefined}
        />
      </div>

      <Onboarding />

      <PersonalCard leaderboard={leaderboard.data} ban={ban.data} />

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile to="/stats" label="Batallas" value={num(summary.data?.total_battles)} loading={summary.isPending} />
        <StatTile to="/stats" label="Jugadores" value={num(summary.data?.total_players)} loading={summary.isPending} />
        <StatTile to="/stats" label="Turnos por batalla" value={num(summary.data?.avg_turns, 1)} loading={summary.isPending} />
        <StatTile to="/stats" label="Mejor win rate" value={pct(summary.data?.top_win_rate, 1)} loading={summary.isPending} hint="mín. 3 batallas" />
      </section>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Accesos">
        <Shortcut to="/bans" icon={<ShieldBan />} title="Fase de bans" tone="warning"
          body={ban.isPending ? <Skeleton className="h-4 w-40" /> : ban.data ? (
            <span className="flex flex-col gap-2">
              <span>{ban.data.total_voted} de {ban.data.total_authorized} ya votaron</span>
              <Meter label="Participación en la votación" value={ban.data.total_voted} max={Math.max(1, ban.data.total_authorized)} />
            </span>
          ) : "Vota y mira los candidatos."} />
        <Shortcut to="/equipo" icon={<Users />} title="Mi equipo" tone="info"
          body={closed ? "El registro está cerrado: los equipos ya son públicos." : "Importa tu paste y comprueba las reglas en vivo."} />
        <Shortcut to="/pokedex" icon={<BookOpen />} title="Pokédex de la liga" tone="success"
          body="Qué se usa, qué se lleva y qué gana." />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Group title="Clasificación" footer="Ordenada por victorias." loading={leaderboard.isPending}
          empty={!leaderboard.isError && leaderboard.data?.length === 0 ? { title: "Aún no hay clasificación", description: "Aparecerá cuando se jueguen batallas." } : undefined}>
          {leaderboard.isError ? <ErrorState error={leaderboard.error} onRetry={() => leaderboard.refetch()} /> :
            leaderboard.data?.slice(0, 5).map((p, i) => (
              <Link key={p.username} to={`/j/${encodeURIComponent(p.username)}`} className="block outline-none focus-visible:bg-muted">
                <GroupRow
                  leading={<span className="flex items-center gap-2"><span className="tabular w-4 text-center text-footnote text-muted-foreground">{i + 1}</span><PlayerAvatar name={p.username} /></span>}
                  title={p.username}
                  subtitle={`${p.wins} V · ${p.losses} D`}
                  trailing={<span className="tabular text-subhead font-medium">{pct(p.win_rate_pct)}</span>}
                />
              </Link>
            ))}
        </Group>

        <Group title="MVP de la temporada" footer="Puntaje acumulado por pokémon y jugador." loading={mvp.isPending}
          empty={!mvp.isError && mvp.data?.length === 0 ? { title: "Aún no hay MVP", description: "Se calcula con las batallas de la temporada." } : undefined}>
          {mvp.isError ? <ErrorState error={mvp.error} onRetry={() => mvp.refetch()} /> :
            mvp.data?.map((m, i) => (
              <Link key={`${m.species}-${m.player}`} to={`/pokedex/${encodeURIComponent(m.species)}`} className="block outline-none focus-visible:bg-muted">
                <GroupRow
                  leading={<span className="flex items-center gap-1">{i === 0 && <Trophy className="size-4 text-warning" />}<PokemonSprite species={m.species} size={40} /></span>}
                  title={m.species}
                  subtitle={`de ${m.player} · ${m.total_kills} KOs`}
                  trailing={<span className="tabular text-subhead font-medium">{num(Number(m.total_mvp_score), 1)}</span>}
                />
              </Link>
            ))}
        </Group>
      </div>
    </div>
  );
}

function Shortcut({ to, icon, title, body, tone }: { to: string; icon: React.ReactNode; title: string; body: React.ReactNode; tone: "warning" | "info" | "success" }) {
  const toneCls = { warning: "bg-warning-soft text-warning", info: "bg-info-soft text-info", success: "bg-success-soft text-success" }[tone];
  return (
    <Link to={to} className="press group flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
      <span className={cn("grid size-10 place-items-center rounded-xl [&_svg]:size-5", toneCls)}>{icon}</span>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-headline">{title}</h2>
        <ArrowRight className="size-4 text-muted-foreground transition-transform [@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-x-0.5" />
      </div>
      <div className="text-footnote text-muted-foreground">{body}</div>
    </Link>
  );
}
