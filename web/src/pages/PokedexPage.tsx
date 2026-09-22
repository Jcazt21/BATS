import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { DataList, type Column } from "@/components/app/DataList";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { Meter } from "@/components/app/Meter";
import { EmptyState, ErrorState } from "@/components/app/States";
import { Input } from "@/components/ui/input";
import type { PokedexRow } from "@/lib/api";
import { usePokedex, useSeasons } from "@/lib/queries";
import { num, pct } from "@/lib/format";

export function PokedexPage() {
  const seasons = useSeasons();
  const active = seasons.data?.find((s) => s.is_active);
  const ready = seasons.isSuccess || seasons.isError;
  const dex = usePokedex(ready ? active?.season_id : null);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const rows = useMemo(
    () => (dex.data?.species ?? []).filter((r) => r.species.toLowerCase().includes(q.trim().toLowerCase())),
    [dex.data, q],
  );

  const cols: Column<PokedexRow>[] = [
    { key: "mon", header: "Pokémon", primary: true, sortValue: (r) => r.species,
      cell: (r) => <span className="inline-flex items-center gap-2 font-medium"><PokemonSprite species={r.species} size={40} />{r.species}</span> },
    { key: "pick", header: "Pick rate", align: "right", sortValue: (r) => r.pick_pct,
      cell: (r) => <span className="inline-flex items-center justify-end gap-2"><Meter label={`Pick rate de ${r.species}`} value={r.pick_pct} className="hidden w-16 lg:block" />{pct(r.pick_pct, 1)}</span> },
    { key: "bring", header: "Bring rate", align: "right", sortValue: (r) => r.bring_pct, cell: (r) => pct(r.bring_pct, 1) },
    { key: "wr", header: "Win rate", align: "right", sortValue: (r) => r.win_rate_pct, cell: (r) => pct(r.win_rate_pct, 1) },
    { key: "mvp", header: "MVP medio", align: "right", hideOnMobile: true, sortValue: (r) => r.avg_mvp, cell: (r) => num(r.avg_mvp, 1) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={active?.season_name}
        title="Pokédex de la liga"
        subtitle="Cuánto se usa cada pokémon, cuánto se lleva y cómo rinde en las batallas de la comunidad."
      />

      <div className="relative max-w-md">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pokémon" aria-label="Buscar pokémon" className="rounded-full pl-10" />
      </div>

      {dex.isError ? <ErrorState error={dex.error} onRetry={() => dex.refetch()} /> : (
        <DataList
          caption="Pokémon de la liga" rows={rows} columns={cols} rowKey={(r) => r.species}
          loading={dex.isPending} defaultSort={{ key: "pick", dir: "desc" }}
          rowPrefetch={(r) => `/pokedex/${encodeURIComponent(r.species)}`}
          onRowClick={(r) => navigate(`/pokedex/${encodeURIComponent(r.species)}`)}
          empty={<EmptyState title={q ? "Sin resultados" : "Aún no hay datos"} description={q ? `Ningún pokémon coincide con “${q}”.` : "Aparecerán cuando se jueguen batallas."} />}
        />
      )}
      <p className="text-caption text-muted-foreground">
        <strong className="font-medium">Pick rate</strong>: porcentaje de equipos en los que el pokémon salió al campo.{" "}
        <strong className="font-medium">Bring rate</strong>: porcentaje de equipos que lo llevaron, aunque no llegara a salir.
      </p>
    </div>
  );
}
