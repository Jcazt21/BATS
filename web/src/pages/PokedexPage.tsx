import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState } from "@/components/app/States";
import { DexCell } from "@/components/pokedex/DexCell";
import { DexEntryModal } from "@/components/pokedex/DexEntryModal";
import { DexPagination } from "@/components/pokedex/DexPagination";
import { DexToolbar } from "@/components/pokedex/DexToolbar";
import { PlayerPicker } from "@/components/pokedex/PlayerPicker";
import { ProgressCard } from "@/components/pokedex/ProgressCard";
import { ProgressRing } from "@/components/pokedex/ProgressRing";
import { ProgressStrip } from "@/components/pokedex/ProgressStrip";
import { SignInCard } from "@/components/SignInCard";
import { buildCollection, collectionProgress, filterCollection, groupByTypes, type DexCell as Cell, type DexFilters } from "@/lib/dex/collection";
import { speciesById } from "@/lib/dex/snapshot";
import { clampPage, PAGE_SIZES, pageCount, paginate } from "@/lib/pagination";
import type { PokemonType } from "@/lib/pokemon-types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useDexEssentials, useMe, usePlayerPokedex } from "@/lib/queries";
import { useSession } from "@/lib/session";

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

  // En pantallas angostas el aside (anillo + desglose) se reemplaza por una tira compacta.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const dex = useDexEssentials();
  const pokedex = usePlayerPokedex(username);
  const cells = useMemo(
    () => (dex.data ? buildCollection(dex.data, pokedex.data?.seen ?? []) : []),
    [dex.data, pokedex.data],
  );
  const progress = useMemo(() => collectionProgress(cells), [cells]);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DexFilters["status"]>("all");
  const [types, setTypes] = useState<PokemonType[]>([]);
  const [gen, setGen] = useState<number | null>(null);
  const deferredQuery = useDeferredValue(query);
  const visible = useMemo(
    () => filterCollection(cells, { query: deferredQuery, status, types, gen }),
    [cells, deferredQuery, status, types, gen],
  );

  // Cambiar filtro, jugador o tamaño de página vuelve a la página 1.
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const pageKey = JSON.stringify([username, deferredQuery, status, types, gen, pageSize]);
  const [pageState, setPageState] = useState({ key: pageKey, page: 1 });
  const totalPages = pageCount(visible.length, pageSize);
  const page = clampPage(pageState.key === pageKey ? pageState.page : 1, totalPages);
  const pageCells = useMemo(() => paginate(visible, page, pageSize), [visible, page, pageSize]);
  const gridTop = useRef<HTMLDivElement>(null);
  const goToPage = (next: number) => {
    setPageState({ key: pageKey, page: clampPage(next, totalPages) });
    gridTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
      <PageHeader
        title={title}
        subtitle="Cada pokémon que ves salir al campo en una batalla de liga queda registrado."
      />

      {guest && (
        <div className="flex justify-center">
          <SignInCard title="Inicia sesión para ver tu Pokédex" description="Usa el correo con el que te registró el admin." />
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => { void dex.refetch(); void pokedex.refetch(); }} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {desktop ? (
            <aside className="order-2 flex flex-col gap-4">
              <PlayerPicker viewing={userParam} me={me.data?.username} />
              <div className="flex justify-center rounded-2xl border bg-card p-4">
                <ProgressRing discovered={progress.discovered} total={progress.total} />
              </div>
              <ProgressCard progress={progress} />
            </aside>
          ) : (
            <ProgressStrip progress={progress} picker={<PlayerPicker viewing={userParam} me={me.data?.username} compact />} />
          )}

          <div ref={gridTop} className="flex min-w-0 scroll-mt-4 flex-col gap-4">
            <DexToolbar
              query={query} onQuery={setQuery}
              status={status} onStatus={setStatus}
              types={types} onTypes={setTypes}
              gen={gen} onGen={setGen}
              compact={!desktop}
            />

            {dex.isPending ? (
              <p className="text-subhead text-muted-foreground">Cargando la Pokédex…</p>
            ) : visible.length === 0 ? (
              <EmptyState title="Nada por aquí" description="Prueba con otro filtro, o busca por número los que aún no descubriste." />
            ) : (
              <div className="flex flex-col gap-8">
                {groupByTypes(pageCells, types).map((section) => (
                  <section key={section.key} aria-label={section.title ?? undefined} className="flex flex-col gap-3">
                    {section.title && (
                      <h2 className="flex items-baseline gap-2 border-b border-border pb-2 text-title3">
                        {section.title}
                        <span className="font-card-mono text-subhead text-muted-foreground tabular">{section.cells.length}</span>
                      </h2>
                    )}
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3" aria-label={section.title ?? "Casillas de la Pokédex"}>
                      {section.cells.map((c) => <li key={c.num}><DexCell cell={c} onOpen={open} /></li>)}
                    </ul>
                  </section>
                ))}
                <DexPagination
                  page={page} totalPages={totalPages} onPage={goToPage}
                  pageSize={pageSize} onPageSize={setPageSize}
                  total={visible.length}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {openCell && openCell.status !== "unknown" && <DexEntryModal cell={openCell} onClose={close} />}
    </div>
  );
}
