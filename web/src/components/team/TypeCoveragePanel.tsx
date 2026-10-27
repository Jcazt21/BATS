import { useId, useState } from "react";
import { TypeBadge } from "@/components/app/TypeBadge";
import { EmptyState } from "@/components/app/States";
import type { CoverageRow } from "@/lib/dex/coverage";
import { typeLabel } from "@/lib/pokemon-types";
import { cn } from "@/lib/utils";

/** Un tipo sin respuesta: golpea a 2+ integrantes y nadie lo resiste ni es inmune. */
export const unanswered = (row: CoverageRow) => row.weak.length >= 2 && row.resist.length + row.immune.length === 0;

/** Resumen de una línea ("2 débiles a Tierra") para la barra móvil; null si no hay nada que señalar. */
export function coverageSummary(rows: CoverageRow[]): string | null {
  const worst = rows.filter((r) => r.sharedWeakness).sort((a, b) => b.weak.length - a.weak.length)[0];
  return worst ? `${worst.weak.length} débiles a ${typeLabel(worst.type)}` : null;
}

function names(list: string[]) {
  return list.length ? list.join(", ") : "nadie";
}

/**
 * Cobertura defensiva del equipo: los 18 tipos con cuántos integrantes son débiles (▲),
 * resisten (▼) o son inmunes (0). Rojo/verde siempre con signo, no solo color. Tocar un tipo
 * despliega qué integrantes lo afectan (disclosure, no tooltip).
 */
export function TypeCoveragePanel({ rows, empty }: { rows: CoverageRow[]; empty?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const detailId = useId();
  const shared = rows.filter((row) => row.sharedWeakness).sort((a, b) => b.weak.length - a.weak.length);
  const current = rows.find((r) => r.type === open) ?? null;

  return (
    <section aria-label="Cobertura de tipos" className="flex flex-col gap-2">
      <h3 className="px-1 text-footnote font-medium uppercase tracking-wide text-muted-foreground">Cobertura de tipos</h3>
      <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {empty ? (
          <EmptyState
            className="py-6"
            title="Aún no hay cobertura"
            description="Agrega pokémon y verás aquí qué tipos te golpean y cuáles resistes."
          />
        ) : (
          <>
            {shared.length > 0 && (
              <ul aria-label="Debilidades compartidas" aria-live="polite" className="border-b border-separator [&>li+li]:border-t [&>li+li]:border-separator">
                {shared.map((row) => (
                  <li key={row.type} className="flex items-start gap-3 px-4 py-3">
                    <TypeBadge type={row.type} />
                    <span className="min-w-0 flex-1 text-footnote text-destructive">
                      Débil: {row.weak.join(", ")}
                      {unanswered(row) && <strong className="ml-1 font-medium">· sin respuesta</strong>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="grid grid-cols-3 gap-px bg-separator sm:grid-cols-6">
              {rows.map((row) => {
                const isOpen = open === row.type;
                return (
                  <li key={row.type} className="bg-card">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      aria-label={`${typeLabel(row.type)}: ${row.weak.length} débiles, ${row.resist.length} resisten, ${row.immune.length} inmunes${unanswered(row) ? ", sin respuesta" : ""}`}
                      onClick={() => setOpen(isOpen ? null : row.type)}
                      className={cn(
                        "press flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        isOpen && "bg-muted",
                      )}
                    >
                      <TypeBadge type={row.type} />
                      <span aria-hidden className="flex gap-2 font-mono text-caption tabular-nums">
                        <span className={row.weak.length ? "text-destructive" : "text-muted-foreground"}>▲{row.weak.length}</span>
                        <span className={row.resist.length ? "text-success" : "text-muted-foreground"}>▼{row.resist.length}</span>
                        {row.immune.length > 0 && <span className="text-success">0·{row.immune.length}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div id={detailId} className="px-4 py-3 text-footnote" hidden={!current}>
              {current && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="font-medium">{typeLabel(current.type)}</dt>
                  <dd />
                  <dt className="text-destructive">▲ Débiles</dt><dd>{names(current.weak)}</dd>
                  <dt className="text-success">▼ Resisten</dt><dd>{names(current.resist)}</dd>
                  <dt className="text-success">0 Inmunes</dt><dd>{names(current.immune)}</dd>
                </dl>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
