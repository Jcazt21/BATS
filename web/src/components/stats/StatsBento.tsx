import { Link } from "react-router-dom";
import { PokemonArtwork } from "@/components/app/PokemonArtwork";
import type { SeasonChoice } from "@/components/app/SeasonSelect";
import MagicBento, { type MagicBentoItem } from "@/components/effects/MagicBento";
import { BentoBars } from "@/components/home/BentoBars";
import { BentoCurve } from "@/components/home/BentoCurve";
import { Skeleton } from "@/components/ui/skeleton";
import type { BattlesPerDay, LeaderboardEntry, LeagueSummary, MvpEntry, PokedexRow } from "@/lib/api";
import { num, pct, variacionSemanal } from "@/lib/format";
import { fichaHref } from "@/lib/stats-links";

export interface StatsBentoProps {
  summary?: LeagueSummary;
  summaryLoading?: boolean;
  leaderboard?: LeaderboardEntry[];
  perDay?: BattlesPerDay;
  /** El más usado de la temporada (primero por `used`). */
  topPokemon?: PokedexRow;
  /** El primero del top de MVP. */
  mvp?: MvpEntry;
  temporada: SeasonChoice;
  dexNum: (species: string) => number | undefined;
}

/** Cabecera del bento de Estadísticas: cifras de la liga en la temporada elegida, con el lenguaje del Inicio. */
export function StatsBento({ summary, summaryLoading, leaderboard, perDay, topPokemon, mvp, temporada, dexNum }: StatsBentoProps) {
  const winrates = [...(leaderboard ?? [])].sort((a, b) => b.win_rate_pct - a.win_rate_pct).slice(0, 8).map((p) => ({
    label: p.username, value: p.win_rate_pct, text: pct(p.win_rate_pct, 1),
  }));
  const dia = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString("es", { day: "numeric", month: "short" });
  const acumuladas = (perDay?.days ?? []).map((d) => ({ label: dia(d.date), value: d.total }));

  const items: MagicBentoItem[] = [
    {
      label: "Batallas", colSpan: 6, rowSpan: 2,
      content: <BentoCurve ariaLabel="Batallas acumuladas" value={num(summary?.total_battles)} note={variacionSemanal(perDay?.last_7, perDay?.prev_7)} points={acumuladas} empty="Aún no hay batallas." />,
    },
    {
      label: "Win rate por jugador", colSpan: 6, rowSpan: 2,
      content: <BentoBars ariaLabel="Win rate por jugador" value={pct(summary?.top_win_rate, 1)} note="Mejor win rate" bars={winrates} empty="Aún no hay jugadores." />,
    },
    {
      label: "Pokémon más usado", colSpan: 4, rowSpan: 2,
      content: topPokemon ? (
        <Destacado to={fichaHref(topPokemon.species, temporada)} species={topPokemon.species} dexNum={dexNum(topPokemon.species)}
          eyebrow="Más usado" cifra={pct(topPokemon.pick_pct, 1)} detalle={`pick rate · ${pct(topPokemon.win_rate_pct, 1)} win rate`} />
      ) : <Vacio titulo="Más usado" texto="Aún no hay pokémon." />,
    },
    {
      label: "MVP de la temporada", colSpan: 4, rowSpan: 2,
      content: mvp ? (
        <Destacado to={fichaHref(mvp.species, temporada)} species={mvp.species} dexNum={dexNum(mvp.species)}
          eyebrow="MVP" cifra={num(Number(mvp.total_mvp_score), 1)} detalle={`de ${mvp.player} · ${mvp.total_kills} KOs`} />
      ) : <Vacio titulo="MVP" texto="Aún no hay MVP." />,
    },
    {
      label: "Cifras de la liga", colSpan: 4, rowSpan: 2,
      content: (
        <dl className="grid flex-1 grid-cols-3 content-center gap-3">
          <Cifra etiqueta="Jugadores" valor={num(summary?.total_players)} loading={summaryLoading} />
          <Cifra etiqueta="Turnos por batalla" valor={num(summary?.avg_turns, 1)} loading={summaryLoading} />
          <Cifra etiqueta="Mejor win rate" valor={pct(summary?.top_win_rate, 1)} pista="mín. 3 batallas" loading={summaryLoading} />
        </dl>
      ),
    },
  ];

  return <MagicBento items={items} columns={12} rowHeight={128} gap={12} role="group" aria-label="Resumen de la temporada" />;
}

function Destacado({ to, species, dexNum, eyebrow, cifra, detalle }: {
  to: string; species: string; dexNum?: number; eyebrow: string; cifra: string; detalle: string;
}) {
  return (
    <Link to={to} className="press -m-2 flex min-w-0 flex-1 items-center gap-4 rounded-2xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid size-24 shrink-0 place-items-center rounded-2xl bg-secondary p-2">
        <PokemonArtwork name={species} dexNum={dexNum} className="text-caption" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-footnote text-muted-foreground">{eyebrow}</span>
        <span className="block truncate text-title3 font-semibold">{species}</span>
        <span className="mt-1 block font-card-mono text-[32px] font-medium leading-none tabular">{cifra}</span>
        <span className="mt-1 block truncate text-footnote text-muted-foreground">{detalle}</span>
      </span>
    </Link>
  );
}

function Vacio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <p className="text-footnote text-muted-foreground">{titulo}</p>
      <p className="mt-2 text-subhead text-muted-foreground">{texto}</p>
    </div>
  );
}

function Cifra({ etiqueta, valor, pista, loading }: { etiqueta: string; valor: string; pista?: string; loading?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-footnote text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-1">
        {loading ? <Skeleton className="h-8 w-14" /> : <span className="font-card-mono text-[28px] font-medium leading-none tabular">{valor}</span>}
        {pista && <span className="mt-1 block truncate text-caption text-muted-foreground">{pista}</span>}
      </dd>
    </div>
  );
}
