import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGE_SIZES, pageWindow } from "@/lib/pagination";

interface Props {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  pageSize: number;
  onPageSize: (size: number) => void;
  total: number;
}

const stepClass =
  "inline-flex size-9 cursor-pointer items-center justify-center rounded-xl text-subhead outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

/** Paginador de la Pokédex: cuántos ver por página, rango actual y números con elipsis. */
export function DexPagination({ page, totalPages, onPage, pageSize, onPageSize, total }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-card p-3 shadow-sm ring-1 ring-border sm:flex-row sm:justify-between">
      <div className="flex items-center gap-3 text-subhead text-muted-foreground">
        <label className="relative inline-flex h-9 items-center">
          <span className="sr-only">Pokémon por página</span>
          <select
            aria-label="Pokémon por página"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="h-9 cursor-pointer appearance-none rounded-xl bg-background/60 pr-8 pl-3 text-subhead text-foreground ring-1 ring-border outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} por página</option>)}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground" />
        </label>
        <span className="tabular">{from}–{to} de {total}</span>
      </div>

      <nav aria-label="Páginas de la Pokédex" className="flex items-center gap-1">
        <button type="button" className={stepClass} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        {pageWindow(page, totalPages).map((item, i) =>
          item === "gap" ? (
            <span key={`gap-${i}`} aria-hidden className="inline-flex size-9 items-center justify-center text-muted-foreground">…</span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPage(item)}
              aria-current={item === page ? "page" : undefined}
              aria-label={`Página ${item}`}
              className={cn(stepClass, "tabular", item === page && "bg-primary text-primary-foreground hover:bg-primary")}
            >
              {item}
            </button>
          ),
        )}
        <button type="button" className={stepClass} onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Página siguiente">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </nav>
    </div>
  );
}
