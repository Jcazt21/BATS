import { useId, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { Button } from "@/components/ui/button";
import type { DexFilters } from "@/lib/dex/collection";
import { typeLabel, type PokemonType } from "@/lib/pokemon-types";
import { cn } from "@/lib/utils";
import { TypeMultiSelect } from "./TypeMultiSelect";

const STATUS_OPTIONS: { value: DexFilters["status"]; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "discovered", label: "Descubiertos" },
  { value: "seen", label: "Vistos" },
  { value: "evolution", label: "Por evolución" },
  { value: "unknown", label: "Sin descubrir" },
];
const GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

interface Props {
  query: string;
  onQuery: (q: string) => void;
  status: DexFilters["status"];
  onStatus: (s: DexFilters["status"]) => void;
  types: PokemonType[];
  onTypes: (t: PokemonType[]) => void;
  gen: number | null;
  onGen: (g: number | null) => void;
  /** Pantallas angostas: estado, tipos y generación pasan a una hoja tras el botón «Filtros». */
  compact?: boolean;
}

/**
 * Barra de la Pokédex: buscador arriba y, debajo, estado, tipos (hasta dos) y generación.
 * En modo compacto queda en una fila (buscador + «Filtros») y los filtros activos se muestran como chips.
 */
export function DexToolbar({ compact = false, ...props }: Props) {
  const { query, onQuery, status, onStatus, types, onTypes, gen, onGen } = props;
  const hintId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);

  const active: { key: string; label: string; clear: () => void }[] = [
    ...(status !== "all" ? [{ key: "status", label: STATUS_OPTIONS.find((o) => o.value === status)!.label, clear: () => onStatus("all") }] : []),
    ...types.map((t) => ({ key: `type-${t}`, label: typeLabel(t), clear: () => onTypes(types.filter((x) => x !== t)) })),
    ...(gen !== null ? [{ key: "gen", label: `Generación ${gen}`, clear: () => onGen(null) }] : []),
  ];

  const search = (
    <label className="group flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-background/60 px-4 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-ring">
      <Search aria-hidden className="size-5 shrink-0 text-muted-foreground transition-colors group-focus-within:text-foreground" />
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Busca por nombre o #número"
        aria-label="Buscar en la Pokédex"
        aria-describedby={hintId}
        className="h-full min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQuery("")}
          aria-label="Borrar búsqueda"
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </label>
  );
  const hint = (
    <p id={hintId} className="mt-1.5 px-1 text-caption text-muted-foreground">
      Por nombre solo aparecen los que ya descubriste; por número, cualquiera.
    </p>
  );
  const genSelect = (
    <label className="relative inline-flex h-10 items-center">
      <span className="sr-only">Generación</span>
      <select
        aria-label="Generación"
        value={gen ?? ""}
        onChange={(e) => onGen(e.target.value ? Number(e.target.value) : null)}
        className={cn(
          "h-10 w-full cursor-pointer appearance-none rounded-xl bg-background/60 pr-9 pl-3 text-subhead ring-1 ring-border outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring",
          !compact && "sm:w-auto",
        )}
      >
        <option value="">Todas las generaciones</option>
        {GENS.map((g) => <option key={g} value={g}>Generación {g}</option>)}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-4 text-muted-foreground" />
    </label>
  );

  if (compact) {
    const count = active.length;
    return (
      <div className="flex flex-col gap-2 rounded-3xl bg-card p-3 shadow-sm ring-1 ring-border">
        <div className="flex items-center gap-2">
          {search}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={count ? `Filtros, ${count} ${count === 1 ? "activo" : "activos"}` : "Filtros"}
            className={cn(
              "relative inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl ring-1 ring-border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              count ? "bg-primary text-primary-foreground" : "bg-background/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <SlidersHorizontal className="size-5" aria-hidden />
            {count > 0 && (
              <span aria-hidden className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-foreground text-caption font-semibold text-background tabular">
                {count}
              </span>
            )}
          </button>
        </div>
        {hint}

        {count > 0 && (
          <ul aria-label="Filtros activos" className="flex flex-wrap gap-1.5">
            {active.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={f.clear}
                  aria-label={`Quitar filtro ${f.label}`}
                  className="press inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-secondary pr-2 pl-3 text-footnote font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {f.label}
                  <X className="size-3.5 opacity-70" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <ResponsiveSheet open={sheetOpen} onOpenChange={setSheetOpen} title="Filtros">
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h3 className="text-footnote text-muted-foreground">Estado</h3>
              {/* Las opciones bajan de línea: todas a la vista, sin deslizar de costado. */}
              <SegmentedControl label="Estado" value={status} onChange={onStatus} options={STATUS_OPTIONS} className="flex flex-wrap gap-1 rounded-2xl" />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-footnote text-muted-foreground">Tipos</h3>
              <TypeMultiSelect value={types} onChange={onTypes} />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-footnote text-muted-foreground">Generación</h3>
              {genSelect}
            </section>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                disabled={count === 0}
                onClick={() => { onStatus("all"); onTypes([]); onGen(null); }}
              >
                Limpiar
              </Button>
              <Button className="flex-1" onClick={() => setSheetOpen(false)}>Listo</Button>
            </div>
          </div>
        </ResponsiveSheet>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-card p-3 shadow-sm ring-1 ring-border">
      <div>
        {search}
        {hint}
      </div>

      {/* Carril con aire vertical y sin barra visible: si la columna se angosta, se desliza de costado
          sin que la pastilla ni el anillo de foco generen scroll vertical. En móvil se usa el modo compacto. */}
      <div className="-mx-3 overflow-x-auto px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedControl label="Estado" value={status} onChange={onStatus} options={STATUS_OPTIONS} className="w-max whitespace-nowrap" />
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <TypeMultiSelect value={types} onChange={onTypes} />
        {genSelect}
      </div>
    </div>
  );
}
