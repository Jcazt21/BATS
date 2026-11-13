import { Check, X } from "lucide-react";
import { Link } from "react-router-dom";
import { PokemonArtwork } from "@/components/app/PokemonArtwork";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/States";
import { TypeBadges } from "@/components/app/TypeBadge";
import MagicBento, { type MagicBentoItem } from "@/components/effects/MagicBento";
import { BentoBars } from "@/components/home/BentoBars";
import { BentoCurve } from "@/components/home/BentoCurve";
import { Skeleton } from "@/components/ui/skeleton";
import type { BattlesPerDay, ChecklistRow, LeaderboardEntry, LeagueSummary, MvpEntry, RecentBattle } from "@/lib/api";
import { haceCuanto, num, pct, variacionSemanal } from "@/lib/format";
import { cn } from "@/lib/utils";

type Lista<T> = { data?: T[]; isPending?: boolean; isError?: boolean; error?: unknown; refetch: () => unknown };

export interface HomeBentoProps {
  leaderboard?: LeaderboardEntry[];
  perDay?: BattlesPerDay;
  summary?: LeagueSummary;
  summaryLoading?: boolean;
  typeOfMonth?: string | null;
  rules?: ChecklistRow[];
  rulesChecked: boolean;
  rulesLoading?: boolean;
  mvp: Lista<MvpEntry>;
  recent: Lista<RecentBattle>;
  dexNum: (species: string) => number | undefined;
}

/** Parte baja del Inicio: cifras de la liga, tipo del mes, MVP y actividad en un bento con luces (MagicBento). */
export function HomeBento({
  leaderboard, perDay, summary, summaryLoading, typeOfMonth, rules, rulesChecked, rulesLoading, mvp, recent, dexNum,
}: HomeBentoProps) {
  const winrates = [...(leaderboard ?? [])].sort((a, b) => b.win_rate_pct - a.win_rate_pct).slice(0, 8).map((p) => ({
    label: p.username, value: p.win_rate_pct, text: pct(p.win_rate_pct, 1),
  }));
  const dia = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString("es", { day: "numeric", month: "short" });
  const acumuladas = (perDay?.days ?? []).map((d) => ({ label: dia(d.date), value: d.total }));
  const delta = variacionSemanal(perDay?.last_7, perDay?.prev_7);

  const items: MagicBentoItem[] = [
    {
      label: "Mejor win rate", colSpan: 4, rowSpan: 2,
      content: <BentoBars ariaLabel="Win rate por jugador" value={pct(summary?.top_win_rate, 1)} note="Mejor win rate" bars={winrates} empty="Aún no hay jugadores." />,
    },
    {
      label: "Batallas", colSpan: 4, rowSpan: 2,
      content: <BentoCurve ariaLabel="Batallas acumuladas" value={num(summary?.total_battles)} note={delta} points={acumuladas} empty="Aún no hay batallas." />,
    },
    {
      label: "Jugadores", colSpan: 4, rowSpan: 2,
      content: (
        <Link to="/stats" className="press -m-2 flex flex-1 flex-col justify-center rounded-2xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {summaryLoading ? <Skeleton className="h-12 w-24" /> : <p className="font-card-mono text-[56px] font-medium leading-none tabular">{num(summary?.total_players)}</p>}
          <p className="mt-3 text-footnote text-muted-foreground">Jugadores</p>
        </Link>
      ),
    },
    {
      label: "Tipo del mes", colSpan: 4, rowSpan: 3,
      content: (
        <Seccion title="Tipo del mes" to="/equipo" linkLabel="Mi equipo">
          <div className="pt-3">{typeOfMonth ? <TypeBadges types={typeOfMonth} /> : <p className="text-footnote text-muted-foreground">{rulesLoading ? "Cargando…" : "Sin tipo del mes."}</p>}</div>
          <ul className="mt-2 divide-y divide-border">
            {(rules ?? []).map((r) => (
              <li key={r.rule} className="flex items-center gap-2.5 py-2.5 text-subhead">
                <span
                  aria-hidden="true"
                  className={cn("grid size-5 shrink-0 place-items-center rounded-full",
                    !rulesChecked ? "bg-secondary text-muted-foreground" : r.ok ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive")}
                >
                  {rulesChecked ? (r.ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />) : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <span className="min-w-0 flex-1">{r.label}</span>
                {rulesChecked && <span className="sr-only">{r.ok ? "Cumple" : "No cumple"}</span>}
                {rulesChecked && r.names.length > 0 && <span className="shrink-0 truncate text-footnote text-muted-foreground">{r.names.join(", ")}</span>}
              </li>
            ))}
          </ul>
        </Seccion>
      ),
    },
    {
      label: "MVP", colSpan: 4, rowSpan: 3,
      content: (
        <Seccion title="MVP" to="/stats" linkLabel="Ver más">
          {mvp.isPending ? <LoadingState rows={3} /> :
            mvp.isError ? <ErrorState error={mvp.error} onRetry={() => mvp.refetch()} /> :
            !mvp.data?.length ? <EmptyState title="Aún no hay MVP" description="Se calcula con las batallas de la temporada." /> : (
              <ul className="divide-y divide-border">
                {mvp.data.slice(0, 3).map((m) => (
                  <li key={`${m.species}-${m.player}`}>
                    <Link to={`/pokedex/${encodeURIComponent(m.species)}`} className="flex items-center gap-3 rounded-2xl py-2.5 outline-none focus-visible:bg-muted">
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary p-1">
                        <PokemonArtwork name={m.species} dexNum={dexNum(m.species)} className="text-caption" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{m.species}</span>
                        <span className="block truncate text-footnote text-muted-foreground">de {m.player} · {m.total_kills} KOs</span>
                      </span>
                      <span className="font-card-mono text-subhead tabular">{num(Number(m.total_mvp_score), 1)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Seccion>
      ),
    },
    {
      label: "Actividad", colSpan: 4, rowSpan: 3,
      content: (
        <Seccion title="Actividad" to="/stats" linkLabel="Todas">
          {recent.isPending ? <LoadingState rows={4} /> :
            recent.isError ? <ErrorState error={recent.error} onRetry={() => recent.refetch()} /> :
            !recent.data?.length ? <EmptyState title="Aún no hay batallas" description="Aparecerán cuando se jueguen." /> : (
              <ul className="divide-y divide-border">
                {recent.data.slice(0, 4).map((b) => (
                  <li key={b.battle_id} className="py-2.5">
                    {b.winner && b.loser ? (
                      <p><Jugador name={b.winner} strong /> <span className="text-footnote text-muted-foreground">venció a</span> <Jugador name={b.loser} /></p>
                    ) : (
                      <p><Jugador name={b.players[0]} strong /> <span className="text-footnote text-muted-foreground">empató con</span> <Jugador name={b.players[1]} /></p>
                    )}
                    <p className="text-footnote text-muted-foreground">{b.turns} turnos · {haceCuanto(b.date)}</p>
                  </li>
                ))}
              </ul>
            )}
        </Seccion>
      ),
    },
  ];

  return <MagicBento items={items} columns={12} rowHeight={128} gap={12} role="group" aria-label="Resumen de la liga" />;
}

/** Cabecera (título + enlace) y una línea fina antes del contenido de las tarjetas grandes. */
function Seccion({ title, to, linkLabel, children }: { title: string; to: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-title3">{title}</h2>
        <Link to={to} className="rounded text-footnote font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">{linkLabel}</Link>
      </div>
      {children}
    </>
  );
}

function Jugador({ name, strong }: { name: string; strong?: boolean }) {
  return (
    <Link to={`/j/${encodeURIComponent(name)}`} className={cn("rounded outline-none focus-visible:ring-2 focus-visible:ring-ring", strong && "font-semibold")}>
      {name}
    </Link>
  );
}
