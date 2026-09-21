import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { ChecklistRow } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Reglas de la temporada con su estado en vivo. Icono + texto (no solo color) y `aria-live`
 * para que un lector de pantalla anuncie cuando cambia.
 */
export function ChecklistPanel({ rows, pending, empty }: { rows: ChecklistRow[] | undefined; pending?: boolean; empty?: boolean }) {
  return (
    <section aria-label="Reglas de la temporada" className="flex flex-col gap-2">
      <h3 className="px-1 text-footnote font-medium uppercase tracking-wide text-muted-foreground">Reglas de la temporada</h3>
      <ul aria-live="polite" className={cn("overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border [&>li+li]:border-t [&>li+li]:border-separator transition-opacity", pending && "opacity-70")}>
        {empty || !rows ? (
          <li className="px-4 py-3 text-subhead text-muted-foreground">Agrega pokémon para comprobar las reglas.</li>
        ) : rows.map((r) => (
          <li key={r.rule} className="flex items-start gap-3 px-4 py-3">
            {r.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />}
            <span className="min-w-0 flex-1">
              <span className="block text-subhead">{r.label}</span>
              {!r.ok && r.names.length > 0 && <span className="block text-footnote text-destructive">{r.names.join(", ")}</span>}
            </span>
            <span className="sr-only">{r.ok ? "Cumple" : "No cumple"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PendingDot() {
  return <Circle className="size-3 animate-pulse text-muted-foreground" aria-hidden />;
}
