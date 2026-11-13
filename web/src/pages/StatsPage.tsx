import { useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/PageHeader";
import { DataList, type Column } from "@/components/app/DataList";
import { Reveal } from "@/components/app/Reveal";
import { SeasonSelect, type SeasonChoice } from "@/components/app/SeasonSelect";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { Meter } from "@/components/app/Meter";
import { EmptyState, ErrorState } from "@/components/app/States";
import HoldButton from "@/components/app/HoldButton";
import { CollectorsRanking } from "@/components/stats/CollectorsRanking";
import { FormDots } from "@/components/stats/FormDots";
import { HeadToHead } from "@/components/stats/HeadToHead";
import { PokemonUsageTable } from "@/components/stats/PokemonUsageTable";
import { StatsBento } from "@/components/stats/StatsBento";
import { UsageScatter } from "@/components/stats/UsageScatter";
import { scatterPoints } from "@/components/stats/scatter-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resetBattleData, type LeaderboardEntry, type MvpEntry } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { speciesById } from "@/lib/dex/snapshot";
import { WIDE_ROW } from "@/lib/layout";
import { streakLabel } from "@/lib/match-result";
import { fichaHref } from "@/lib/stats-links";
import { useBattlesPerDay, useDexEssentials, useLeaderboard, useMe, useMvp, usePokemonStats, useSeasons, useSummary } from "@/lib/queries";
import { useToast } from "@/lib/toast";
import { num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatsPage({ showAdminControls = false }: { showAdminControls?: boolean }) {
  const seasons = useSeasons();
  const [seasonChoice, setSeasonChoice] = useState<SeasonChoice>("active");
  const active = seasons.data?.find((s) => s.is_active);
  const sid = seasonChoice === "active" ? active?.season_id : seasonChoice === "all" ? undefined : seasonChoice;
  // Espera a saber la temporada para no pedir dos veces (todas y luego la activa).
  const ready = seasons.isSuccess || seasons.isError;

  const season = ready ? sid : null;
  const summary = useSummary(season);
  const leaderboard = useLeaderboard(season);
  const mvp = useMvp(season);
  const pokemonStats = usePokemonStats(season);
  const perDay = useBattlesPerDay(30, season);
  const dex = useDexEssentials();
  const me = useMe();
  const dexNum = (species: string) => (dex.data ? speciesById(dex.data, species)?.num : undefined);
  // Datos de la temporada anterior mientras llegan los de la elegida.
  const refreshing = [summary, leaderboard, mvp, pokemonStats, perDay].some((q) => q.isPlaceholderData);
  // Al llegar los datos de la temporada elegida el contenido se remonta y entra con un fundido; mientras
  // tanto se sigue viendo (atenuado) lo anterior. Ajuste de estado durante el render: sin efectos ni parpadeo.
  const [settledSid, setSettledSid] = useState(sid);
  if (!refreshing && settledSid !== sid) setSettledSid(sid);

  type Ranked = LeaderboardEntry & { _rank: number };
  const leaderboardCols: Column<Ranked>[] = [
    { key: "rank", header: "#", cell: (r) => <span className="text-muted-foreground">{r._rank}</span>, hideOnMobile: true, className: "w-10" },
    { key: "player", header: "Jugador", primary: true, sortValue: (r) => r.username,
      cell: (r) => <Link to={`/j/${encodeURIComponent(r.username)}`} className="inline-flex items-center gap-2 font-medium hover:underline"><span className="tabular text-muted-foreground md:hidden"><span className="sr-only">Posición </span>{r._rank}</span><PlayerAvatar name={r.username} size={28} />{r.username}</Link> },
    { key: "wins", header: "Victorias", align: "right", sortValue: (r) => r.wins, cell: (r) => r.wins },
    { key: "losses", header: "Derrotas", align: "right", sortValue: (r) => r.losses, cell: (r) => r.losses },
    { key: "ties", header: "E", align: "right", sortValue: (r) => r.ties, cell: (r) => <><span className="sr-only">Empates: </span>{r.ties}</> },
    { key: "wr", header: "Win rate", align: "right", sortValue: (r) => r.win_rate_pct,
      cell: (r) => <span className="inline-flex items-center justify-end gap-2"><Meter label={`Win rate de ${r.username}`} value={r.win_rate_pct} className="w-16" tone={r.win_rate_pct >= 50 ? "success" : "primary"} />{pct(r.win_rate_pct)}</span> },
    { key: "form", header: "Forma", hideOnMobile: true, cell: (r) => <FormDots form={r.form ?? []} /> },
    { key: "streak", header: "Racha", align: "right", sortValue: (r) => (r.streak?.type === "W" ? 1 : r.streak?.type === "L" ? -1 : 0) * (r.streak?.length ?? 0),
      cell: (r) => <span className="font-card-mono tabular">{streakLabel(r.streak)}</span> },
    { key: "surv", header: "Supervivientes", align: "right", hideOnMobile: true, sortValue: (r) => r.total_survivors, cell: (r) => r.total_survivors },
  ];
  // La posición sale del orden de origen (victorias), no del orden que elija el usuario
  const ranked: Ranked[] = (leaderboard.data ?? []).map((r, i) => ({ ...r, _rank: i + 1 }));

  const mvpCols: Column<MvpEntry>[] = [
    { key: "mon", header: "Pokémon", primary: true, sortValue: (r) => r.species, cell: (r) => (
      <Link to={fichaHref(r.species, seasonChoice)} className="inline-flex items-center gap-2 font-medium hover:underline"><PokemonSprite species={r.species} size={36} />{r.species}</Link>) },
    { key: "player", header: "Jugador", sortValue: (r) => r.player, cell: (r) => r.player },
    { key: "mvp", header: "MVP", align: "right", sortValue: (r) => Number(r.total_mvp_score), cell: (r) => num(Number(r.total_mvp_score), 1) },
    { key: "kills", header: "KOs", align: "right", sortValue: (r) => r.total_kills, cell: (r) => r.total_kills },
    { key: "avg", header: "MVP / batalla", align: "right", hideOnMobile: true, cell: (r) => num(Number(r.avg_mvp_per_battle), 1) },
  ];

  return (
    <div className={cn(showAdminControls ? "flex flex-col gap-8" : `flex flex-col gap-10 ${WIDE_ROW}`)} aria-busy={refreshing || undefined}>
      <PageHeader
        eyebrow={seasonChoice === "all" ? "Todas las temporadas" : active && sid === active.season_id ? "Temporada activa" : "Estadísticas"}
        title="Estadísticas"
        subtitle="Rendimiento de jugadores y pokémon en las batallas de la liga."
        actions={
          <>
            {seasons.data && seasons.data.length > 0 && (
              <SeasonSelect seasons={seasons.data} value={seasonChoice} onChange={setSeasonChoice} />
            )}
            {showAdminControls && <ResetButton />}
          </>
        }
      />

      <Reveal key={String(settledSid)} data-stats-content className="flex flex-col gap-8">
        <div className={cn("transition-opacity duration-200", refreshing && "opacity-60")}>
          <StatsBento
            summary={summary.data} summaryLoading={summary.isPending} leaderboard={leaderboard.data} perDay={perDay.data}
            topPokemon={pokemonStats.data?.species[0]} mvp={mvp.data?.[0]} temporada={seasonChoice} dexNum={dexNum}
          />
        </div>

        <Tabs defaultValue="jugadores" className={cn("gap-4 transition-opacity duration-200", refreshing && "opacity-60")}>
          <TabsList className="h-11 self-start">
            <TabsTrigger value="jugadores" className="px-4">Jugadores</TabsTrigger>
            <TabsTrigger value="pokemon" className="px-4">Pokémon</TabsTrigger>
            <TabsTrigger value="coleccionistas" className="px-4">Coleccionistas</TabsTrigger>
          </TabsList>

          <TabsContent value="jugadores" className="flex flex-col gap-6">
            {leaderboard.isError ? <ErrorState error={leaderboard.error} onRetry={() => leaderboard.refetch()} /> : (
              <DataList caption="Clasificación de jugadores" rows={ranked} columns={leaderboardCols} rowKey={(r) => r.username} mobileSort
                loading={leaderboard.isPending} defaultSort={{ key: "wins", dir: "desc" }}
                empty={<EmptyState title="Aún no hay batallas" description="Cuando se juegue la primera aparecerá aquí." />} />
            )}
            {leaderboard.data && <HeadToHead players={leaderboard.data} me={me.data?.username} season={season} dexNum={dexNum} />}
          </TabsContent>

          <TabsContent value="pokemon" className="flex flex-col gap-6">
            {/* La dispersión solo con al menos un punto válido; si no, la tabla muestra el estado que corresponde. */}
            {pokemonStats.data && scatterPoints(pokemonStats.data.species).length > 0 && (
              <UsageScatter rows={pokemonStats.data.species} temporada={seasonChoice} />
            )}
            <section aria-labelledby="top-mvp" className="flex flex-col gap-3">
              <h2 id="top-mvp" className="px-1 text-title3">Top de MVP</h2>
              {mvp.isError ? <ErrorState error={mvp.error} onRetry={() => mvp.refetch()} /> : (
                <DataList caption="Top de MVP" rows={mvp.data ?? []} columns={mvpCols} rowKey={(r) => `${r.species}-${r.player}`} mobileSort loading={mvp.isPending}
                  empty={<EmptyState title="Sin datos de MVP" />} />
              )}
            </section>
            <section aria-labelledby="uso-pokemon" className="flex flex-col gap-3">
              <h2 id="uso-pokemon" className="px-1 text-title3">Uso por especie</h2>
              <PokemonUsageTable query={pokemonStats} temporada={seasonChoice} />
            </section>
          </TabsContent>

          <TabsContent value="coleccionistas" className="flex flex-col gap-3">
            <CollectorsRanking />
          </TabsContent>
        </Tabs>
      </Reveal>
    </div>
  );
}

function ResetButton() {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  async function run() {
    setBusy(true);
    try {
      await resetBattleData();
      await qc.invalidateQueries();
      toast({ title: "Base limpiada", description: "Se borraron todas las batallas.", tone: "success" });
    } catch (e) {
      toast({ title: "No se pudo limpiar", description: errorMessage(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <HoldButton
      icon={<Trash2 size={16} />}
      doneIcon={<Trash2 size={16} />}
      doneLabel="Base limpiada"
      backgroundColor="var(--card)"
      fillColor="var(--destructive)"
      textColor="var(--destructive)"
      fillTextColor="oklch(1 0 0)"
      size="md"
      radius={999}
      holdTime={1800}
      resetAfter={1200}
      disabled={busy}
      className="ring-1 ring-inset ring-destructive/30"
      onHold={() => void run()}
    >
      Mantén para limpiar DB
    </HoldButton>
  );
}
