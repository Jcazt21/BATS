import { useDeferredValue, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { EmptyState, ErrorState } from "@/components/app/States";
import { TypeFilter } from "@/components/app/TypeFilter";
import { DexCell } from "@/components/pokedex/DexCell";
import { DexEntryModal } from "@/components/pokedex/DexEntryModal";
import { ProgressCard } from "@/components/pokedex/ProgressCard";
import { ProgressRing } from "@/components/pokedex/ProgressRing";
import { SignInCard } from "@/components/SignInCard";
import { Input } from "@/components/ui/input";
import { buildCollection, collectionProgress, filterCollection, type DexCell as Cell, type DexFilters } from "@/lib/dex/collection";
import { speciesById } from "@/lib/dex/snapshot";
import type { PokemonType } from "@/lib/pokemon-types";
import { useDexEssentials, useMe, usePlayerPokedex } from "@/lib/queries";
import { useSession } from "@/lib/session";

const STATUS_OPTIONS: { value: DexFilters["status"]; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "discovered", label: "Descubiertos" },
  { value: "seen", label: "Vistos" },
  { value: "evolution", label: "Por evolución" },
  { value: "unknown", label: "Sin descubrir" },
];
const GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const selectCls = "h-10 rounded-xl border border-input bg-card px-3 text-subhead outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

/**
 * Pokédex por cuenta: /pokedex (la mía), /j/:username/pokedex (la de otro, pública).
 * Con :species abre la ficha de esa casilla en un modal sobre la grilla.
 */
export function PokedexPage() {
  const { username: userParam, species: speciesParam } = useParams();
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useSession();
  const me = useMe();
  const username = userParam ?? me.data?.username;
  const guest = !userParam && !sessionLoading && !session;
  const base = userParam ? `/j/${encodeURIComponent(userParam)}/pokedex` : "/pokedex";

  const dex = useDexEssentials();
  const pokedex = usePlayerPokedex(username);
  const cells = useMemo(
    () => (dex.data ? buildCollection(dex.data, pokedex.data?.seen ?? []) : []),
    [dex.data, pokedex.data],
  );
  const progress = useMemo(() => collectionProgress(cells), [cells]);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DexFilters["status"]>("all");
  const [type, setType] = useState<PokemonType | null>(null);
  const [gen, setGen] = useState<number | null>(null);
  const deferredQuery = useDeferredValue(query);
  const visible = useMemo(
    () => filterCollection(cells, { query: deferredQuery, status, type, gen }),
    [cells, deferredQuery, status, type, gen],
  );

  // Ficha abierta por URL: solo si esa casilla está descubierta (no revelar por la barra de direcciones).
  const openSpecies = speciesParam && dex.data ? speciesById(dex.data, speciesParam) : null;
  const openCell = openSpecies ? cells.find((c) => c.num === openSpecies.num) : undefined;
  // Con sesión, hasta saber quién soy no hay Pokédex que mirar: no decidir (ni redirigir) antes.
  const waitingForMe = !userParam && (sessionLoading || (!!session && !me.data && !me.isError));
  const dataReady = dex.isSuccess && !waitingForMe && (!username || pokedex.isSuccess || pokedex.isError);
  if (speciesParam && dataReady && (!openCell || openCell.status === "unknown")) {
    return <Navigate to={base} replace />;
  }
  const open = (cell: Cell) => navigate(`${base}/${encodeURIComponent(cell.species.id)}`);
  const close = () => navigate(base);

  const title = userParam ? `Pokédex de ${userParam}` : "Pokédex";
  const error = dex.error ?? (pokedex.isError ? pokedex.error : null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} subtitle="Cada pokémon que ves salir al campo en una batalla de liga queda registrado." />

      {guest && (
        <div className="flex justify-center">
          <SignInCard title="Inicia sesión para ver tu Pokédex" description="Usa el correo con el que te registró el admin." />
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => { void dex.refetch(); void pokedex.refetch(); }} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <aside className="flex flex-col gap-4 lg:order-2">
            <div className="flex justify-center rounded-2xl border bg-card p-4">
              <ProgressRing discovered={progress.discovered} total={progress.total} />
            </div>
            <ProgressCard progress={progress} />
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar descubiertos por nombre, o cualquiera por número"
                aria-label="Buscar en la Pokédex"
                className="pl-9"
              />
            </div>
            <div className="-mx-4 overflow-x-auto px-4">
              <SegmentedControl label="Estado" value={status} onChange={setStatus} options={STATUS_OPTIONS} className="w-max whitespace-nowrap" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <TypeFilter value={type} onChange={setType} />
              <select
                aria-label="Generación"
                value={gen ?? ""}
                onChange={(e) => setGen(e.target.value ? Number(e.target.value) : null)}
                className={selectCls}
              >
                <option value="">Todas las generaciones</option>
                {GENS.map((g) => <option key={g} value={g}>Generación {g}</option>)}
              </select>
            </div>

            {dex.isPending ? (
              <p className="text-subhead text-muted-foreground">Cargando la Pokédex…</p>
            ) : visible.length === 0 ? (
              <EmptyState title="Nada por aquí" description="Prueba con otro filtro, o busca por número los que aún no descubriste." />
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3" aria-label="Casillas de la Pokédex">
                {visible.map((c) => <li key={c.num}><DexCell cell={c} onOpen={open} /></li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {openCell && openCell.status !== "unknown" && <DexEntryModal cell={openCell} onClose={close} />}
    </div>
  );
}
