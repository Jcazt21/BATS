import { useId } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import type { DexFilters } from "@/lib/dex/collection";
import type { PokemonType } from "@/lib/pokemon-types";
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
}

/** Barra de la Pokédex: buscador arriba y, debajo, estado, tipos (hasta dos) y generación. */
export function DexToolbar({ query, onQuery, status, onStatus, types, onTypes, gen, onGen }: Props) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-card p-3 shadow-sm ring-1 ring-border">
      <div>
        <label className="group flex h-12 items-center gap-3 rounded-2xl bg-background/60 px-4 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-ring">
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
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </label>
        <p id={hintId} className="mt-1.5 px-1 text-caption text-muted-foreground">
          Por nombre solo aparecen los que ya descubriste; por número, cualquiera.
        </p>
      </div>

      {/* Carril con aire vertical y sin barra visible: en pantallas angostas se desliza de costado
          sin que la pastilla ni el anillo de foco generen scroll vertical. */}
      <div className="-mx-3 overflow-x-auto px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedControl label="Estado" value={status} onChange={onStatus} options={STATUS_OPTIONS} className="w-max whitespace-nowrap" />
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <TypeMultiSelect value={types} onChange={onTypes} />
        <label className="relative inline-flex h-10 items-center">
          <span className="sr-only">Generación</span>
          <select
            aria-label="Generación"
            value={gen ?? ""}
            onChange={(e) => onGen(e.target.value ? Number(e.target.value) : null)}
            className="h-10 w-full appearance-none rounded-xl bg-background/60 pr-9 pl-3 text-subhead ring-1 ring-border outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            <option value="">Todas las generaciones</option>
            {GENS.map((g) => <option key={g} value={g}>Generación {g}</option>)}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-4 text-muted-foreground" />
        </label>
      </div>
    </div>
  );
}
