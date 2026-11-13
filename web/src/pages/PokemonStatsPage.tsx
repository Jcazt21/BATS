import { useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { PokemonArtwork } from "@/components/app/PokemonArtwork";
import { TypeBadges } from "@/components/app/TypeBadge";
import { Meter } from "@/components/app/Meter";
import { EmptyState, ErrorState } from "@/components/app/States";
import MagicBento, { type MagicBentoItem } from "@/components/effects/MagicBento";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/http";
import { WIDE_ROW } from "@/lib/layout";
import { useActiveSeason, usePokemonStatsEntry } from "@/lib/queries";
import type { CountedName } from "@/lib/api";
import { num, pct } from "@/lib/format";

export function PokemonStatsPage() {
  const { species = "" } = useParams();
  const season = useActiveSeason();
  const [params] = useSearchParams();
  const temporada = params.get("temporada");
  // Misma temporada que la lista de origen: "all" = todas, un número = esa, nada = la activa.
  const sid = temporada === "all" ? undefined : temporada && Number.isInteger(Number(temporada)) ? Number(temporada) : season.data?.season_id;
  const q = usePokemonStatsEntry(species, sid);

  const back = (
    <Link
      to="/stats"
      className="press inline-flex min-h-11 items-center gap-1 self-start rounded-full text-subhead font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-4" /> Estadísticas
    </Link>
  );

  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className={`flex flex-col gap-6 ${WIDE_ROW}`}>
        {back}
        {notFound
          ? <EmptyState title="Ese pokémon aún no aparece en la liga" description="Cuando alguien lo lleve a una batalla tendrá su ficha aquí." />
          : <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      </div>
    );
  }

  const d = q.data;

  const statItems: MagicBentoItem[] = [
    {
      id: "pick",
      label: "Pick rate",
      colSpan: 2,
      rowSpan: 1,
      content: (
        <Cifra
          label="Pick rate"
          value={pct(d?.pick_pct, 1)}
          hint={d ? `${d.used} de ${d.total_slots} equipos` : undefined}
          loading={q.isPending}
        />
      ),
    },
    {
      id: "bring",
      label: "Bring rate",
      colSpan: 2,
      rowSpan: 1,
      content: (
        <Cifra
          label="Bring rate"
          value={pct(d?.bring_pct, 1)}
          hint={d ? `${d.brought} de ${d.total_slots} equipos` : undefined}
          loading={q.isPending}
        />
      ),
    },
    {
      id: "win",
      label: "Win rate",
      colSpan: 2,
      rowSpan: 1,
      content: <Cifra label="Win rate" value={pct(d?.win_rate_pct, 1)} loading={q.isPending} />,
    },
    {
      id: "mvp",
      label: "MVP medio",
      colSpan: 2,
      rowSpan: 1,
      content: (
        <Cifra
          label="MVP medio"
          value={num(d?.avg_mvp, 1)}
          hint={d ? `${num(d.avg_kills, 1)} KOs por batalla` : undefined}
          loading={q.isPending}
        />
      ),
    },
    {
      id: "survival",
      label: "Supervivencia",
      colSpan: 2,
      rowSpan: 1,
      content: (
        <Cifra
          label="Supervivencia"
          value={pct(d?.survival_pct, 1)}
          hint="terminó la batalla vivo"
          loading={q.isPending}
        />
      ),
    },
  ];

  const detailItems: MagicBentoItem[] = [
    {
      id: "users",
      label: "Quién lo usa",
      colSpan: 6,
      rowSpan: 2,
      content: (
        <Seccion title="Quién lo usa">
          {q.isPending ? (
            <div className="pt-4"><Skeleton className="h-24" /></div>
          ) : !d?.users.length ? (
            <EmptyState title="Nadie lo ha sacado todavía" />
          ) : (
            <ul className="divide-y divide-border">
              {d.users.map((u) => (
                <li key={u.username}>
                  <Link
                    to={`/j/${encodeURIComponent(u.username)}`}
                    className="flex min-h-12 items-center gap-3 rounded-2xl py-2.5 outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <PlayerAvatar name={u.username} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-foreground">{u.username}</span>
                      <span className="block truncate text-footnote text-muted-foreground">
                        {u.kills} KOs · MVP {num(u.mvp, 1)}
                      </span>
                    </span>
                    <span className="font-card-mono text-subhead font-medium tabular">{u.uses}×</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      ),
    },
    {
      id: "sets",
      label: "Sets registrados",
      colSpan: 6,
      rowSpan: 2,
      content: (
        <Seccion
          title="Sets registrados"
          note={d && d.sets.players > 0 ? `De ${d.sets.players} ${d.sets.players === 1 ? "jugador" : "jugadores"}` : undefined}
        >
          {q.isPending ? (
            <div className="pt-4"><Skeleton className="h-32" /></div>
          ) : !d || d.sets.players === 0 ? (
            <EmptyState
              className="py-8"
              title="Los sets aún son privados"
              description="Los sets son información competitiva: se publican cuando el admin cierra el registro de equipos."
            />
          ) : (
            <div className="flex flex-col gap-5 pt-4">
              <Ranking title="Movimientos" items={d.sets.moves} total={d.sets.players} />
              <Ranking title="Objetos" items={d.sets.items} total={d.sets.players} />
              <Ranking title="Habilidades" items={d.sets.abilities} total={d.sets.players} />
              <Ranking title="Teratipo" items={d.sets.tera_types} total={d.sets.players} />
              <Ranking title="Naturalezas" items={d.sets.natures} total={d.sets.players} />
            </div>
          )}
        </Seccion>
      ),
    },
  ];

  return (
    <div className={`flex flex-col gap-8 ${WIDE_ROW}`}>
      {back}
      <div className="flex items-center gap-5">
        {d ? (
          <span className="grid size-28 shrink-0 place-items-center rounded-3xl bg-secondary p-3 sm:size-32">
            <PokemonArtwork name={d.species} dexNum={d.national_dex} />
          </span>
        ) : (
          <Skeleton className="size-28 shrink-0 rounded-3xl sm:size-32" />
        )}
        <div className="min-w-0">
          <PageHeader
            title={d?.species ?? species}
            eyebrow={d?.national_dex ? `Nº ${String(d.national_dex).padStart(4, "0")}` : undefined}
          />
          {d && <div className="mt-2"><TypeBadges types={d.types} /></div>}
        </div>
      </div>

      <MagicBento items={statItems} columns={10} rowHeight={148} gap={12} role="group" aria-label="Rendimiento" />

      {d && d.bring_pct != null && d.pick_pct != null && d.bring_pct > d.pick_pct + 5 && (
        <p className="rounded-2xl bg-info-soft px-4 py-3 text-subhead text-info" role="note">
          Se lleva más de lo que sale: {pct(d.bring_pct, 1)} de los equipos lo incluyen, pero solo en {pct(d.pick_pct, 1)} llega al campo.
        </p>
      )}

      <MagicBento items={detailItems} columns={12} rowHeight={160} gap={12} role="group" aria-label="Uso y sets" />
    </div>
  );
}

/** Cifra de rendimiento dentro de una celda MagicBento, con número grande estilo HomeBento. */
function Cifra({ label, value, hint, loading }: { label: string; value: ReactNode; hint?: ReactNode; loading?: boolean }) {
  return (
    <div className="flex flex-1 flex-col justify-between gap-2">
      <p className="text-footnote font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="h-11 w-24" />
      ) : (
        <p className="font-card-mono text-[44px] font-medium leading-none tabular text-foreground">{value}</p>
      )}
      <p className="min-h-4 text-caption text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Cabecera de tarjeta grande con línea fina, como en HomeBento. */
function Seccion({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-title3">{title}</h2>
        {note && <span className="text-footnote text-muted-foreground">{note}</span>}
      </div>
      {children}
    </>
  );
}

const VISIBLES = 5;

function RankingRow({ i, total }: { i: CountedName; total: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <span className="truncate text-subhead">{i.name}</span>
      <span className="tabular text-footnote text-muted-foreground">{pct((100 * i.count) / total)}</span>
      <Meter className="col-span-2" label={`${i.name}: ${i.count} de ${total}`} value={i.count} max={total} />
    </li>
  );
}

/** Top 5 siempre visible; el resto, tras "Ver más". */
function Ranking({ title, items, total }: { title: string; items: CountedName[]; total: number }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const resto = items.slice(VISIBLES);
  return (
    <div>
      <h3 className="mb-2 text-footnote font-medium text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-2">
        {items.slice(0, VISIBLES).map((i) => <RankingRow key={i.name} i={i} total={total} />)}
      </ul>
      {resto.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleContent>
            <ul className="mt-2 flex flex-col gap-2">{resto.map((i) => <RankingRow key={i.name} i={i} total={total} />)}</ul>
          </CollapsibleContent>
          <CollapsibleTrigger className="mt-1 flex min-h-11 items-center rounded-lg text-subhead text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {open ? "Ver menos" : `Ver más (${resto.length})`}
          </CollapsibleTrigger>
        </Collapsible>
      )}
    </div>
  );
}
