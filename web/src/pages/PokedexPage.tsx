import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Search } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { DataList, type Column } from "@/components/app/DataList";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { Meter } from "@/components/app/Meter";
import { SeasonSelect, type SeasonChoice } from "@/components/app/SeasonSelect";
import { EmptyState, ErrorState } from "@/components/app/States";
import { TypeFilter } from "@/components/app/TypeFilter";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import type { PokedexRow } from "@/lib/api";
import { speciesById } from "@/lib/dex/snapshot";
import { isPokemonType, type PokemonType } from "@/lib/pokemon-types";
import { useDexEssentials, usePokedex, useSeasons } from "@/lib/queries";
import { num, pct } from "@/lib/format";

export function PokedexPage() {
  const seasons = useSeasons();
  const [params, setParams] = useSearchParams();
  const active = seasons.data?.find((s) => s.is_active);
  const ready = seasons.isSuccess || seasons.isError;

  // Filtros en la URL: se pueden compartir y sobreviven a recargar.
  const tipoParam = params.get("tipo");
  const tipo: PokemonType | null = tipoParam && isPokemonType(tipoParam) ? tipoParam : null;
  const temporadaParam = params.get("temporada");
  const choice: SeasonChoice = temporadaParam === "all" ? "all" : temporadaParam && Number.isInteger(Number(temporadaParam)) ? Number(temporadaParam) : "active";
  const sid = choice === "active" ? active?.season_id : choice === "all" ? undefined : choice;

  const dex = usePokedex(ready ? sid : null);
  const species = useDexEssentials();
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  function setParam(clave: string, valor: string | null) {
    setParams((cur) => {
      const next = new URLSearchParams(cur);
      if (valor) next.set(clave, valor); else next.delete(clave);
      return next;
    }, { replace: true });
  }

  const rows = useMemo(
    () => (dex.data?.species ?? []).filter((r) => {
      if (!r.species.toLowerCase().includes(q.trim().toLowerCase())) return false;
      if (!tipo) return true;
      const tipos = species.data ? speciesById(species.data, r.species)?.types : undefined;
      return !!tipos?.some((t) => t.toLowerCase() === tipo);
    }),
    [dex.data, q, tipo, species.data],
  );
  const filtrando = !!q || !!tipo;

  const cols: Column<PokedexRow>[] = [
    { key: "mon", header: "Pokémon", primary: true, sortValue: (r) => r.species,
      cell: (r) => <span className="inline-flex items-center gap-2 font-medium"><PokemonSprite species={r.species} size={40} />{r.species}</span> },
    { key: "pick", header: "Pick rate", align: "right", sortValue: (r) => r.pick_pct,
      cell: (r) => <span className="inline-flex items-center justify-end gap-2"><Meter label={`Pick rate de ${r.species}`} value={r.pick_pct} className="w-16" />{pct(r.pick_pct, 1)}</span> },
    { key: "bring", header: "Bring rate", align: "right", sortValue: (r) => r.bring_pct, cell: (r) => pct(r.bring_pct, 1) },
    { key: "wr", header: "Win rate", align: "right", sortValue: (r) => r.win_rate_pct, cell: (r) => pct(r.win_rate_pct, 1) },
    { key: "mvp", header: "MVP medio", align: "right", hideOnMobile: true, sortValue: (r) => r.avg_mvp, cell: (r) => num(r.avg_mvp, 1) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={choice === "all" ? "Todas las temporadas" : (seasons.data?.find((s) => s.season_id === sid)?.season_name ?? active?.season_name)}
        title="Pokédex de la liga"
        subtitle="Cuánto se usa cada pokémon, cuánto se lleva y cómo rinde en las batallas de la comunidad."
        actions={seasons.data && seasons.data.length > 0 ? (
          <SeasonSelect seasons={seasons.data} value={choice} onChange={(v) => setParam("temporada", v === "active" ? null : String(v))} />
        ) : undefined}
      />

      <div className="flex flex-col gap-4">
        <div className="relative max-w-md">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pokémon" aria-label="Buscar pokémon" className="rounded-full pl-10" />
        </div>
        {species.isSuccess && <TypeFilter value={tipo} onChange={(t) => setParam("tipo", t)} />}
      </div>

      {dex.isError ? <ErrorState error={dex.error} onRetry={() => dex.refetch()} /> : (
        <DataList
          caption="Pokémon de la liga" rows={rows} columns={cols} rowKey={(r) => r.species}
          loading={dex.isPending} defaultSort={{ key: "pick", dir: "desc" }}
          rowHref={(r) => `/pokedex/${encodeURIComponent(r.species)}`}
          rowPrefetch={(r) => `/pokedex/${encodeURIComponent(r.species)}`}
          onRowClick={(r) => navigate(`/pokedex/${encodeURIComponent(r.species)}`)}
          empty={<EmptyState title={filtrando ? "Sin resultados" : "Aún no hay datos"} description={filtrando ? "Ningún pokémon coincide con esos filtros." : "Aparecerán cuando se jueguen batallas."} />}
        />
      )}

      <Collapsible>
        <CollapsibleTrigger className="group/def flex min-h-11 items-center gap-1 rounded-lg text-subhead text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
          ¿Qué significan pick y bring rate?
          <ChevronDown className="size-4 transition-transform duration-200 ease-ios group-aria-expanded/def:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="text-caption text-muted-foreground">
            <strong className="font-medium">Pick rate</strong>: porcentaje de equipos en los que el pokémon salió al campo.{" "}
            <strong className="font-medium">Bring rate</strong>: porcentaje de equipos que lo llevaron, aunque no llegara a salir.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
