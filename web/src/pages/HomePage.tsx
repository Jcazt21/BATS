import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState } from "@/components/app/States";
import { ActionsRow } from "@/components/home/ActionsRow";
import { GuestHero } from "@/components/home/GuestHero";
import { LeaguePulse } from "@/components/home/LeaguePulse";
import { MonthRulesList } from "@/components/home/MonthRulesList";
import { MvpList } from "@/components/home/MvpList";
import { RecentActivity } from "@/components/home/RecentActivity";
import { TeamCard } from "@/components/home/TeamCard";
import { TrainerCard } from "@/components/home/TrainerCard";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { checkTeam, type BuilderMon } from "@/lib/dex/validate";
import { speciesById, toId } from "@/lib/dex/snapshot";
import { ApiError } from "@/lib/http";
import {
  useActiveSeason, useBanStatus, useDexDetails, useDexEssentials, useEligibility, useLeaderboard, useMe, useMvp,
  usePlayerProfile, useRecentBattles, useRoster, useSummary,
} from "@/lib/queries";
import { useSession } from "@/lib/session";

/** Carnet | equipo. El carnet era de 380×485 (≈0,78 de ancho/alto); al crecer la fila con las cartas grandes (~590 px) crece también el ancho (26 %, entre 380 y 480 px) para mantener esa proporción. */
const STATE_GRID = "lg:grid-cols-[clamp(380px,26%,480px)_minmax(0,1fr)]";
const CARD_SKELETON = "min-h-[485px] rounded-[var(--radius-card)]";
/** Toda la Home: en escritorio rompe el ancho de la página (max-w-6xl) hasta 1760px, centrada, para que carnet, equipo y secciones de abajo compartan borde izquierdo. */
const WIDE_ROW = "lg:w-[min(calc(100vw_-_3rem),1760px)] lg:ml-[calc(50%_-_min(calc(50vw_-_1.5rem),880px))]";

export function HomePage() {
  const { session, loading: sessionLoading } = useSession();
  const season = useActiveSeason();
  const summary = useSummary();
  const leaderboard = useLeaderboard();
  const mvp = useMvp();
  const ban = useBanStatus();
  const recent = useRecentBattles(8);
  const dex = useDexEssentials();
  const dexDetails = useDexDetails();
  const me = useMe();
  const profile = usePlayerProfile(me.data?.username ?? "");
  const roster = useRoster();
  const elig = useEligibility();

  // Número de Pokédex desde el dex local (la misma fuente de verdad del teambuilder).
  const dexNum = useCallback(
    (species: string) => (dex.data ? speciesById(dex.data, species)?.num : undefined),
    [dex.data],
  );

  // Sprite Gen 5 de la forma exacta: el dex trae el `spriteid` de Showdown de cada especie.
  const spriteId = useCallback(
    (species: string) => (dex.data ? speciesById(dex.data, species)?.spriteid : undefined),
    [dex.data],
  );

  // Tipo de un movimiento (para el punto de color de la carta); sin dex cargado, sin color.
  const moveType = useCallback(
    (move: string) => dexDetails.data?.moves[toId(move)]?.type,
    [dexDetails.data],
  );

  const username = me.data?.username;
  const rankIndex = username && leaderboard.data ? leaderboard.data.findIndex((p) => p.username.toLowerCase() === username.toLowerCase()) : -1;
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;
  const noTeam = roster.isError && roster.error instanceof ApiError && roster.error.status === 404;

  // Reglas del mes: con equipo registrado se comprueban contra él; si no, solo se listan.
  const rules = useMemo(() => {
    if (!dex.data || !season.data) return undefined;
    const r = roster.data;
    const mons: BuilderMon[] = (r ? (r.lineup_set ? r.pool.filter((p) => p.in_lineup) : r.pool) : []).map((p) => ({
      species: p.name, held_item: p.held_item, ability: p.ability, nature: p.nature, tera_type: p.tera_type,
      moves: p.moves, evs: p.evs, ivs: p.ivs,
    }));
    const { rows } = checkTeam(dex.data, mons, {
      type_of_month: season.data.type_of_month, max_team_size: season.data.max_team_size, restrictions: season.data.restrictions,
    }, new Set(), !!r?.lineup_set);
    return { rows: r ? rows : rows.filter((x) => x.rule !== "team_size"), checked: !!r };
  }, [dex.data, season.data, roster.data]);

  const seasonName = season.data?.season_name;
  const showTop = !sessionLoading && !!session;

  return (
    <div className={`flex flex-col gap-10 ${WIDE_ROW}`}>
      <h1 className="sr-only">Inicio · PinchesGueys League</h1>

      {sessionLoading ? (
        <div className={`grid gap-3 ${STATE_GRID}`} role="status">
          <span className="sr-only">Cargando</span>
          <Skeleton className={CARD_SKELETON} /><Skeleton className={`${CARD_SKELETON} hidden lg:block`} />
        </div>
      ) : !session ? (
        <GuestHero season={seasonName} />
      ) : (
        <section aria-label="Tu estado" className={`grid gap-3 ${STATE_GRID}`}>
          {me.isError ? (
            <div className="rounded-[var(--radius-card)] border border-border lg:col-span-2"><ErrorState error={me.error} onRetry={() => me.refetch()} /></div>
          ) : !username ? (
            <>
              <Skeleton className={CARD_SKELETON} /><Skeleton className={`${CARD_SKELETON} hidden lg:block`} />
            </>
          ) : (
            <>
              <TrainerCard username={username} season={seasonName} rank={rank} totalPlayers={leaderboard.data?.length} profile={profile.data} />
              {roster.isPending ? <Skeleton className={CARD_SKELETON} /> :
                noTeam ? (
                  <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-border lg:min-h-[485px]">
                    <EmptyState title="Aún no registras tu equipo" description="Importa tu paste y comprueba las reglas en vivo."
                      action={<Link to="/equipo" className={buttonVariants()}>Registrar equipo</Link>} />
                  </div>
                ) : roster.isError ? (
                  <div className="rounded-[var(--radius-card)] border border-border lg:min-h-[485px]"><ErrorState error={roster.error} onRetry={() => roster.refetch()} /></div>
                ) : roster.data && (
                  <TeamCard pool={roster.data.pool} lineupSet={roster.data.lineup_set} maxTeamSize={roster.data.max_team_size} season={seasonName} dexNum={dexNum} moveType={moveType} spriteId={spriteId} />
                )}
            </>
          )}
        </section>
      )}

      {showTop && !me.isError && (
        <ActionsRow ban={ban.data} elig={elig.data} roster={roster.data} noTeam={noTeam} className="-mt-4" />
      )}

      <LeaguePulse summary={summary.data} loading={summary.isPending} />

      <div className="grid gap-10 lg:grid-cols-3">
        <MonthRulesList typeOfMonth={season.data?.type_of_month} rows={rules?.rows} checked={rules?.checked ?? false} loading={season.isPending} />
        <MvpList query={mvp} dexNum={dexNum} />
        <RecentActivity query={recent} />
      </div>
    </div>
  );
}
