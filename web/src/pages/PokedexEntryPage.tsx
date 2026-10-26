import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatTile } from "@/components/app/StatTile";
import { Group, GroupRow } from "@/components/app/Group";
import { PlayerAvatar } from "@/components/app/PlayerAvatar";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { TypeBadges } from "@/components/app/TypeBadge";
import { Meter } from "@/components/app/Meter";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/http";
import { useActiveSeason, usePokedexEntry } from "@/lib/queries";
import type { CountedName } from "@/lib/api";
import { num, pct } from "@/lib/format";

export function PokedexEntryPage() {
  const { species = "" } = useParams();
  const season = useActiveSeason();
  const [params] = useSearchParams();
  const temporada = params.get("temporada");
  // Misma temporada que la lista de origen: "all" = todas, un número = esa, nada = la activa.
  const sid = temporada === "all" ? undefined : temporada && Number.isInteger(Number(temporada)) ? Number(temporada) : season.data?.season_id;
  const q = usePokedexEntry(species, sid);

  const back = (
    <Link to={temporada ? `/pokedex?temporada=${encodeURIComponent(temporada)}` : "/pokedex"} className="inline-flex items-center gap-1 text-subhead text-primary hover:underline">
      <ArrowLeft className="size-4" /> Pokédex
    </Link>
  );

  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex flex-col gap-6">
        {back}
        {notFound
          ? <EmptyState title="Ese pokémon aún no aparece en la liga" description="Cuando alguien lo lleve a una batalla tendrá su ficha aquí." />
          : <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      </div>
    );
  }

  const d = q.data;
  return (
    <div className="flex flex-col gap-8">
      {back}
      <div className="flex items-center gap-5">
        {d ? <PokemonSprite species={d.species} src={d.sprite_url} size={112} /> : <Skeleton className="size-28 rounded-2xl" />}
        <div className="min-w-0">
          <PageHeader title={d?.species ?? species} eyebrow={d?.national_dex ? `Nº ${String(d.national_dex).padStart(4, "0")}` : undefined} />
          {d && <div className="mt-2"><TypeBadges types={d.types} /></div>}
        </div>
      </div>

      <section aria-label="Rendimiento" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Pick rate" value={pct(d?.pick_pct, 1)} hint={d ? `${d.used} de ${d.total_slots} equipos` : undefined} loading={q.isPending} />
        <StatTile label="Bring rate" value={pct(d?.bring_pct, 1)} hint={d ? `${d.brought} de ${d.total_slots} equipos` : undefined} loading={q.isPending} />
        <StatTile label="Win rate" value={pct(d?.win_rate_pct, 1)} loading={q.isPending} />
        <StatTile label="MVP medio" value={num(d?.avg_mvp, 1)} hint={d ? `${num(d.avg_kills, 1)} KOs por batalla` : undefined} loading={q.isPending} />
      </section>

      {d && d.bring_pct != null && d.pick_pct != null && d.bring_pct > d.pick_pct + 5 && (
        <p className="rounded-2xl bg-info-soft px-4 py-3 text-subhead text-info" role="note">
          Se lleva más de lo que sale: {pct(d.bring_pct, 1)} de los equipos lo incluyen, pero solo en {pct(d.pick_pct, 1)} llega al campo.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Group title="Quién lo usa">
          {q.isPending ? <div className="p-4"><Skeleton className="h-24" /></div> : !d?.users.length ? <EmptyState title="Nadie lo ha sacado todavía" /> :
            d.users.map((u) => (
              <Link key={u.username} to={`/j/${encodeURIComponent(u.username)}`} className="block">
                <GroupRow leading={<PlayerAvatar name={u.username} />} title={u.username}
                  subtitle={`${u.kills} KOs · MVP ${num(u.mvp, 1)}`} trailing={<span className="tabular text-subhead font-medium">{u.uses}×</span>} />
              </Link>
            ))}
        </Group>

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-footnote font-medium uppercase tracking-wide text-muted-foreground">Sets registrados</h2>
          <div className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
            {q.isPending ? <Skeleton className="h-32" /> : !d || d.sets.players === 0 ? (
              <EmptyState className="py-8" title="Los sets aún son privados"
                description="Los sets son información competitiva: se publican cuando el admin cierra el registro de equipos." />
            ) : (
              <>
                <p className="text-footnote text-muted-foreground">De {d.sets.players} {d.sets.players === 1 ? "jugador" : "jugadores"}.</p>
                <Ranking title="Movimientos" items={d.sets.moves} total={d.sets.players} />
                <Ranking title="Objetos" items={d.sets.items} total={d.sets.players} />
                <Ranking title="Habilidades" items={d.sets.abilities} total={d.sets.players} />
                <Ranking title="Teratipo" items={d.sets.tera_types} total={d.sets.players} />
                <Ranking title="Naturalezas" items={d.sets.natures} total={d.sets.players} />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
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
