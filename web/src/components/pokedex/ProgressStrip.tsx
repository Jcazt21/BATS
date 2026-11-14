import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import type { DexProgress } from "@/lib/dex/collection";
import { ProgressCard } from "./ProgressCard";
import { ProgressRing } from "./ProgressRing";

/**
 * Resumen de la Pokédex para pantallas angostas: selector de jugador y una fila con anillo chico y
 * totales. El desglose completo (último descubierto, por generación) se abre en una hoja inferior,
 * así la grilla empieza enseguida.
 */
export function ProgressStrip({ progress, picker }: { progress: DexProgress; picker: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Resumen de la Pokédex" className="flex flex-col gap-3 rounded-3xl bg-card p-3 shadow-sm ring-1 ring-border">
      {picker}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ver progreso"
        className="flex cursor-pointer items-center gap-3 rounded-2xl px-1 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ProgressRing discovered={progress.discovered} total={progress.total} size={56} label={false} />
        <span className="min-w-0 flex-1">
          <span className="block text-headline tabular">
            {progress.discovered} <span className="text-muted-foreground">/ {progress.total}</span>
          </span>
          <span className="block truncate text-footnote text-muted-foreground tabular">
            Vistos {progress.seen} · Evolución {progress.evolution}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-footnote font-medium text-muted-foreground">
          Detalle <ChevronRight className="size-4" aria-hidden />
        </span>
      </button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Progreso de la Pokédex">
        <ProgressCard progress={progress} />
      </ResponsiveSheet>
    </section>
  );
}
