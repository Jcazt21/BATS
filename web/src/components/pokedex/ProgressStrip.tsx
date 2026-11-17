import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import type { DexProgress } from "@/lib/dex/collection";
import { haceCuanto } from "@/lib/format";
import { ProgressCard } from "./ProgressCard";
import { ProgressRing } from "./ProgressRing";

/**
 * Resumen compacto de la Pokédex para pantallas angostas: selector de jugador, anillo chico,
 * descubiertos/total y último descubierto. El desglose completo abre en una hoja inferior.
 */
export function ProgressStrip({ progress, picker }: { progress: DexProgress; picker: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { last } = progress;

  return (
    <section aria-label="Resumen de la Pokédex" className="dex-glow-tile flex flex-col gap-2.5 rounded-3xl bg-card p-3">
      {picker}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ver progreso"
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl px-1 py-0.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ProgressRing discovered={progress.discovered} total={progress.total} size={52} label={false} />
        <span className="min-w-0 flex-1">
          <span className="block font-card-mono text-headline tabular">
            {progress.discovered} <span className="text-muted-foreground">/ {progress.total}</span>
          </span>
          <span className="block truncate text-footnote text-muted-foreground">
            {last?.firstSeen
              ? `Último: ${last.species.name} · ${haceCuanto(last.firstSeen.at)}`
              : `Vistos ${progress.seen} · Evolución ${progress.evolution}`}
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
