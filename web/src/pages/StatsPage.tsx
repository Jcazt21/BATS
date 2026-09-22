import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/PageHeader";
import { StatTile } from "@/components/app/StatTile";
import { DataList, type Column } from "@/components/app/DataList";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { Meter } from "@/components/app/Meter";
import { EmptyState, ErrorState } from "@/components/app/States";
import HoldButton from "@/components/app/HoldButton";
import { resetBattleData, type LeaderboardEntry, type MvpEntry, type PickRateEntry } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useLeaderboard, useMvp, usePickRate, useSeasons, useSummary } from "@/lib/queries";
import { useToast } from "@/lib/toast";
import { num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatsPage({ showAdminControls = false }: { showAdminControls?: boolean }) {
  const seasons = useSeasons();
  const [seasonChoice, setSeasonChoice] = useState<"active" | "all" | number>("active");
  const active = seasons.data?.find((s) => s.is_active);
  const sid = seasonChoice === "active" ? active?.season_id : seasonChoice === "all" ? undefined : seasonChoice;
  // Espera a saber la temporada para no pedir dos veces (todas y luego la activa).
  const ready = seasons.isSuccess || seasons.isError;

  const season = ready ? sid : null;
  const summary = useSummary(season);
  const leaderboard = useLeaderboard(season);
  const mvp = useMvp(season);
  const pick = usePickRate(season);
  const [view, setView] = useState<"chart" | "list">("chart");
  // Datos de la temporada anterior mientras llegan los de la elegida.
  const refreshing = [summary, leaderboard, mvp, pick].some((q) => q.isPlaceholderData);

  type Ranked = LeaderboardEntry & { _rank: number };
  const leaderboardCols: Column<Ranked>[] = [
    { key: "rank", header: "#", cell: (r) => <span className="text-muted-foreground">{r._rank}</span>, hideOnMobile: true, className: "w-10" },
    { key: "player", header: "Jugador", primary: true, sortValue: (r) => r.username,
      cell: (r) => <Link to={`/j/${encodeURIComponent(r.username)}`} className="inline-flex items-center gap-2 font-medium hover:underline"><PlayerAvatar name={r.username} size={28} />{r.username}</Link> },
    { key: "wins", header: "Victorias", align: "right", sortValue: (r) => r.wins, cell: (r) => r.wins },
    { key: "losses", header: "Derrotas", align: "right", sortValue: (r) => r.losses, cell: (r) => r.losses },
    { key: "wr", header: "Win rate", align: "right", sortValue: (r) => r.win_rate_pct,
      cell: (r) => <span className="inline-flex items-center justify-end gap-2"><Meter label={`Win rate de ${r.username}`} value={r.win_rate_pct} className="hidden w-16 md:block" tone={r.win_rate_pct >= 50 ? "success" : "primary"} />{pct(r.win_rate_pct)}</span> },
    { key: "surv", header: "Supervivientes", align: "right", hideOnMobile: true, sortValue: (r) => r.total_survivors, cell: (r) => r.total_survivors },
  ];
  // La posición sale del orden de origen (victorias), no del orden que elija el usuario
  const ranked: Ranked[] = (leaderboard.data ?? []).map((r, i) => ({ ...r, _rank: i + 1 }));

  const mvpCols: Column<MvpEntry>[] = [
    { key: "mon", header: "Pokémon", primary: true, cell: (r) => (
      <Link to={`/pokedex/${encodeURIComponent(r.species)}`} className="inline-flex items-center gap-2 font-medium hover:underline"><PokemonSprite species={r.species} size={36} />{r.species}</Link>) },
    { key: "player", header: "Jugador", cell: (r) => r.player },
    { key: "mvp", header: "MVP", align: "right", cell: (r) => num(Number(r.total_mvp_score), 1) },
    { key: "kills", header: "KOs", align: "right", cell: (r) => r.total_kills },
    { key: "avg", header: "MVP / batalla", align: "right", hideOnMobile: true, cell: (r) => num(Number(r.avg_mvp_per_battle), 1) },
  ];

  const pickCols: Column<PickRateEntry>[] = [
    { key: "mon", header: "Pokémon", primary: true, cell: (r) => (
      <Link to={`/pokedex/${encodeURIComponent(r.species)}`} className="inline-flex items-center gap-2 font-medium hover:underline"><PokemonSprite species={r.species} size={32} />{r.species}</Link>) },
    { key: "used", header: "Batallas", align: "right", sortValue: (r) => Number(r.battles_used), cell: (r) => r.battles_used },
    { key: "usage", header: "Uso", align: "right", sortValue: (r) => Number(r.usage_pct), cell: (r) => pct(Number(r.usage_pct), 1) },
    { key: "wr", header: "Win rate", align: "right", sortValue: (r) => Number(r.win_rate_pct), cell: (r) => pct(Number(r.win_rate_pct), 1) },
  ];

  return (
    <div className={showAdminControls ? "flex flex-col gap-8" : "flex flex-col gap-10"} aria-busy={refreshing || undefined}>
      <PageHeader
        eyebrow={seasonChoice === "all" ? "Todas las temporadas" : active && sid === active.season_id ? "Temporada activa" : "Estadísticas"}
        title="Estadísticas"
        subtitle="Rendimiento de jugadores y pokémon en las batallas de la liga."
        actions={
          <>
            {seasons.data && seasons.data.length > 0 && (
              <label className="flex items-center gap-2 text-footnote text-muted-foreground">
                <span className="sr-only sm:not-sr-only">Temporada</span>
                <select
                  value={seasonChoice}
                  onChange={(e) => setSeasonChoice(e.target.value === "active" || e.target.value === "all" ? e.target.value : Number(e.target.value))}
                  className="h-10 rounded-full border border-input bg-card px-4 text-subhead text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {active && <option value="active">{active.season_name} (activa)</option>}
                  {seasons.data.filter((s) => !s.is_active).map((s) => <option key={s.season_id} value={s.season_id}>{s.season_name}</option>)}
                  <option value="all">Todas las temporadas</option>
                </select>
              </label>
            )}
            {showAdminControls && <ResetButton />}
          </>
        }
      />

      <section aria-label="Resumen" className={cn("grid grid-cols-2 gap-3 transition-opacity duration-200 md:grid-cols-4", refreshing && "opacity-60")}>
        <StatTile label="Batallas" value={num(summary.data?.total_battles)} loading={summary.isPending} />
        <StatTile label="Jugadores" value={num(summary.data?.total_players)} loading={summary.isPending} />
        <StatTile label="Turnos por batalla" value={num(summary.data?.avg_turns, 1)} loading={summary.isPending} />
        <StatTile label="Mejor win rate" value={pct(summary.data?.top_win_rate, 1)} loading={summary.isPending} hint="mín. 3 batallas" />
      </section>

      <section className={cn("flex flex-col gap-3 transition-opacity duration-200", refreshing && "opacity-60")}>
        <h2 className="text-title3">Clasificación</h2>
        {leaderboard.isError ? <ErrorState error={leaderboard.error} onRetry={() => leaderboard.refetch()} /> : (
          <DataList caption="Clasificación de jugadores" rows={ranked} columns={leaderboardCols} rowKey={(r) => r.username}
            loading={leaderboard.isPending} defaultSort={{ key: "wins", dir: "desc" }}
            empty={<EmptyState title="Aún no hay batallas" description="Cuando se juegue la primera aparecerá aquí." />} />
        )}
      </section>

      <section className={cn("flex flex-col gap-3 transition-opacity duration-200", refreshing && "opacity-60")}>
        <h2 className="text-title3">Mejores MVP</h2>
        {mvp.isError ? <ErrorState error={mvp.error} onRetry={() => mvp.refetch()} /> : (
          <DataList caption="Top de MVP" rows={mvp.data ?? []} columns={mvpCols} rowKey={(r) => `${r.species}-${r.player}`} loading={mvp.isPending}
            empty={<EmptyState title="Sin datos de MVP" />} />
        )}
      </section>

      <section className={cn("flex flex-col gap-3 transition-opacity duration-200", refreshing && "opacity-60")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-title3">Uso de pokémon</h2>
          <SegmentedControl label="Vista" value={view} onChange={setView} options={[{ value: "chart", label: "Gráfico" }, { value: "list", label: "Lista" }]} />
        </div>
        {pick.isError ? <ErrorState error={pick.error} onRetry={() => pick.refetch()} /> :
          view === "list" || pick.isPending || !pick.data?.length ? (
            <DataList caption="Pick rate por pokémon" rows={pick.data ?? []} columns={pickCols} rowKey={(r) => r.species}
              loading={pick.isPending} defaultSort={{ key: "used", dir: "desc" }} empty={<EmptyState title="Sin datos de uso" />} />
          ) : <PickChart rows={pick.data} />}
      </section>
    </div>
  );
}

function PickChart({ rows }: { rows: PickRateEntry[] }) {
  const data = rows.slice(0, 10).map((r) => ({ species: r.species, uso: Number(r.usage_pct), wr: Number(r.win_rate_pct) }));
  return (
    <figure className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border" aria-label="Gráfico de uso de los 10 pokémon más usados">
      <div className="h-[22rem]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="var(--separator)" />
            <XAxis type="number" unit="%" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="species" width={110} tick={{ fill: "var(--foreground)", fontSize: 13 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "var(--muted)" }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)" }}
              formatter={(v, name) => [`${num(Number(v), 1)}%`, name === "uso" ? "Uso" : "Win rate"]} />
            <Bar dataKey="uso" radius={[0, 8, 8, 0]} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.species} fill={d.wr >= 50 ? "var(--chart-6)" : "var(--chart-1)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex items-center gap-4 text-caption text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-chart-6" /> Win rate ≥ 50 %</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-chart-1" /> Win rate &lt; 50 %</span>
      </figcaption>
    </figure>
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
