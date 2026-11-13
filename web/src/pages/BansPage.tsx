import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/app/PageHeader";
import { Group, GroupRow } from "@/components/app/Group";
import { DataList, type Column } from "@/components/app/DataList";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { Meter } from "@/components/app/Meter";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { VoteFlow } from "@/components/ban/VoteFlow";
import type { BanCandidate } from "@/lib/api";
import { useActiveSeason, useBanCandidates, useBanRanking, useBanStatus } from "@/lib/queries";
import { num, pct } from "@/lib/format";
import { BAN_RADAR_THRESHOLD_PCT } from "@/lib/ban";

/** Mismo estilo que el título de `Group`, para que todas las secciones se lean igual. */
const tituloCls = "px-1 text-footnote font-medium uppercase tracking-wide text-muted-foreground";

export function BansPage() {
  const season = useActiveSeason();
  const status = useBanStatus();
  const ranking = useBanRanking();
  const [min, setMin] = useState<"1" | "3" | "5">("3");
  const candidates = useBanCandidates(Number(min));
  const votes = ranking.data?.filter((r) => r.season_id === season.data?.season_id) ?? [];
  const totalVotes = status.data?.total_votes_cast ?? 0;

  const cols: Column<BanCandidate>[] = [
    { key: "mon", header: "Pokémon", primary: true, sortValue: (r) => r.species,
      cell: (r) => <Link to={`/stats/pokemon/${encodeURIComponent(r.species)}`} className="inline-flex items-center gap-2 font-medium hover:underline"><PokemonSprite species={r.species} src={r.sprite_url} size={36} />{r.species}</Link> },
    { key: "wr", header: "Win rate", align: "right", sortValue: (r) => r.win_rate_pct,
      cell: (r) => <span className="inline-flex items-center justify-end gap-2"><Meter label={`Win rate de ${r.species}`} value={r.win_rate_pct} tone="warning" className="hidden w-16 md:block" />{pct(r.win_rate_pct, 1)}</span> },
    { key: "n", header: "Batallas", align: "right", sortValue: (r) => r.battles_used, cell: (r) => r.battles_used },
    { key: "mvp", header: "MVP medio", align: "right", hideOnMobile: true, sortValue: (r) => r.avg_mvp_score, cell: (r) => num(r.avg_mvp_score, 1) },
    { key: "votes", header: "Votos", align: "right", sortValue: (r) => r.votes, cell: (r) => r.votes > 0 ? <Badge variant="warning">{r.votes}</Badge> : <span className="text-muted-foreground">0</span> },
  ];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow={season.data?.season_name}
        title="Fase de bans"
        subtitle="Vota por el pokémon que crees que rompe la liga. Los candidatos con más victorias te ayudan a decidir."
      />

      <section aria-label="Estado de la votación" className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
        {status.isPending ? (
          <Skeleton className="h-5 w-56" />
        ) : (
          <p className="tabular text-subhead">
            <strong>{status.data ? `${status.data.total_voted}/${status.data.total_authorized}` : "—"}</strong> han votado ·{" "}
            {num(status.data?.total_votes_cast)} votos · {status.data?.voting_open ? "Abierta" : "Completa"}
          </p>
        )}
        {status.data && <Meter label="Participación" value={status.data.total_voted} max={Math.max(1, status.data.total_authorized)} />}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3">
          <h2 className={tituloCls}>Tu voto</h2>
          <VoteFlow />
        </section>

        <Group title="Ranking en vivo" footer="Se actualiza solo cada pocos segundos."
          loading={ranking.isPending} loadingRows={4}>
          {ranking.isError ? <ErrorState error={ranking.error} onRetry={() => ranking.refetch()} /> :
            votes.length === 0 ? <EmptyState title="Aún no hay votos" description="El primero en votar aparecerá aquí." /> :
            votes.slice(0, 8).map((r) => (
              <GroupRow key={r.pokemon_name}
                leading={<span className="flex items-center gap-2"><span className="tabular w-4 text-center text-footnote text-muted-foreground">{r.ranking}</span><PokemonSprite species={r.pokemon_name} src={r.sprite_url} size={40} /></span>}
                title={r.pokemon_name}
                subtitle={<Meter label={`Votos de ${r.pokemon_name}`} value={r.total_votes} max={Math.max(1, totalVotes)} className="mt-1.5" />}
                trailing={<span className="tabular text-subhead font-medium">{r.total_votes}</span>} />
            ))}
        </Group>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={tituloCls}>Ban Radar</h2>
            <p className="px-1 text-footnote text-muted-foreground">Pokémon con más del {BAN_RADAR_THRESHOLD_PCT} % de victorias.</p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl label="Mínimo de batallas" value={min} onChange={setMin}
              options={[{ value: "1", label: "≥ 1" }, { value: "3", label: "≥ 3" }, { value: "5", label: "≥ 5" }]} />
            <span className="text-caption text-muted-foreground">batallas mínimas</span>
          </div>
        </div>
        {candidates.isError ? <ErrorState error={candidates.error} onRetry={() => candidates.refetch()} /> : (
          <DataList caption="Candidatos a ban" rows={candidates.data ?? []} columns={cols} rowKey={(r) => `${r.species}-${r.format_name}`}
            loading={candidates.isPending} defaultSort={{ key: "wr", dir: "desc" }}
            empty={<EmptyState title="Ningún pokémon domina" description={`Nadie supera el ${BAN_RADAR_THRESHOLD_PCT} % de victorias con al menos ${min} batallas. Buena señal.`} />} />
        )}
      </section>
    </div>
  );
}
