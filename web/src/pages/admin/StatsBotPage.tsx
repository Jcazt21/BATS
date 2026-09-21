import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/PageHeader";
import { StatTile } from "@/components/app/StatTile";
import { DataList, type Column } from "@/components/app/DataList";
import { BattleDetail } from "@/components/app/BattleDetail";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import { getBotBattleDetails, getBotBattles, getBotPokemon, getBotSummary, type BotBattleEntry, type BotPokemonEntry, type BotSummaryEntry } from "@/lib/api";
import { fmtDate, num, pct } from "@/lib/format";

/** Rendimiento de los jugadores contra el PGL-Bot. */
export function StatsBotPage() {
  const summary = useQuery({ queryKey: ["bot", "summary"], queryFn: getBotSummary });
  const pokemon = useQuery({ queryKey: ["bot", "pokemon"], queryFn: getBotPokemon });
  const battles = useQuery({ queryKey: ["bot", "battles"], queryFn: getBotBattles });
  const [selected, setSelected] = useState<BotBattleEntry | null>(null);
  const detail = useQuery({ queryKey: ["bot", "battle", selected?.battle_id], queryFn: () => getBotBattleDetails(selected!.battle_id), enabled: !!selected });

  const total = (summary.data ?? []).reduce((a, s) => a + s.total_battles, 0);
  const wins = (summary.data ?? []).reduce((a, s) => a + s.wins, 0);

  const playerCols: Column<BotSummaryEntry>[] = [
    { key: "p", header: "Jugador", primary: true, sortValue: (r) => r.username, cell: (r) => <span className="font-medium">{r.username}</span> },
    { key: "n", header: "Batallas", align: "right", sortValue: (r) => r.total_battles, cell: (r) => r.total_battles },
    { key: "w", header: "V–D", align: "right", cell: (r) => `${r.wins}–${r.losses}` },
    { key: "wr", header: "Win rate", align: "right", sortValue: (r) => r.win_rate_pct, cell: (r) => pct(r.win_rate_pct, 1) },
    { key: "t", header: "Turnos", align: "right", hideOnMobile: true, cell: (r) => num(r.avg_turns, 1) },
  ];
  const monCols: Column<BotPokemonEntry>[] = [
    { key: "m", header: "Pokémon", primary: true, sortValue: (r) => r.species, cell: (r) => <span className="inline-flex items-center gap-2 font-medium"><PokemonSprite species={r.species} size={32} />{r.species}</span> },
    { key: "u", header: "Jugador", cell: (r) => r.username },
    { key: "n", header: "Usos", align: "right", sortValue: (r) => r.times_used, cell: (r) => r.times_used },
    { key: "k", header: "KOs", align: "right", sortValue: (r) => r.total_kills, cell: (r) => r.total_kills },
    { key: "s", header: "Supervivencia", align: "right", hideOnMobile: true, sortValue: (r) => r.survival_pct, cell: (r) => pct(r.survival_pct) },
    { key: "mvp", header: "MVP", align: "right", sortValue: (r) => Number(r.total_mvp_score), cell: (r) => num(Number(r.total_mvp_score), 1) },
  ];
  const battleCols: Column<BotBattleEntry>[] = [
    { key: "p", header: "Jugador", primary: true, cell: (r) => <span className="font-medium">{r.player}</span> },
    { key: "r", header: "Resultado", cell: (r) => <Badge variant={r.player_won ? "success" : "destructive"}>{r.player_won ? "Victoria" : "Derrota"}</Badge> },
    { key: "t", header: "Turnos", align: "right", cell: (r) => r.turns },
    { key: "d", header: "Fecha", sortValue: (r) => r.battle_date, cell: (r) => fmtDate(r.battle_date) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Contra el bot" subtitle="Cómo les va a los jugadores frente al PGL-Bot." />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Batallas" value={total} loading={summary.isPending} />
        <StatTile label="Victorias de humanos" value={wins} loading={summary.isPending} />
        <StatTile label="Win rate global" value={pct(total ? (100 * wins) / total : null, 1)} loading={summary.isPending} />
        <StatTile label="Jugadores" value={summary.data?.length ?? 0} loading={summary.isPending} />
      </section>

      <Section title="Jugadores" q={summary}><DataList caption="Resumen por jugador" rows={summary.data ?? []} columns={playerCols} rowKey={(r) => r.username} loading={summary.isPending} defaultSort={{ key: "n", dir: "desc" }} empty={<EmptyState title="Sin batallas contra el bot" />} /></Section>
      <Section title="Pokémon" q={pokemon}><DataList caption="Pokémon usados contra el bot" rows={pokemon.data ?? []} columns={monCols} rowKey={(r) => `${r.species}-${r.username}`} loading={pokemon.isPending} defaultSort={{ key: "mvp", dir: "desc" }} empty={<EmptyState title="Sin datos" />} /></Section>
      <Section title="Últimas batallas" q={battles}><DataList caption="Batallas recientes" rows={battles.data ?? []} columns={battleCols} rowKey={(r) => r.battle_id} loading={battles.isPending} onRowClick={setSelected} defaultSort={{ key: "d", dir: "desc" }} empty={<EmptyState title="Sin batallas" />} /></Section>

      <ResponsiveSheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)} className="sm:max-w-3xl" title={selected ? `${selected.player} vs PGL-Bot` : ""} description={selected ? fmtDate(selected.battle_date) : undefined}>
        {selected && <BattleDetail rows={detail.data} loading={detail.isPending} players={[selected.player, "PGL-Bot"]} winner={selected.player_won ? selected.player : "PGL-Bot"} />}
      </ResponsiveSheet>
    </div>
  );
}

function Section({ title, q, children }: { title: string; q: { isError: boolean; error: unknown; refetch: () => unknown }; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title3">{title}</h2>
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : children}
    </section>
  );
}
