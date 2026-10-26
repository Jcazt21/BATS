import { CheckCircle2, Circle, Info, XCircle } from "lucide-react";
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
            {/* La clave cambia con el estado: el icono nuevo se remonta y entra con un fundido de 150ms. */}
            <span key={r.ok ? "ok" : r.blocking === false ? "info" : "fail"} data-status-icon className="mt-0.5 shrink-0 animate-in fade-in-0 duration-150">
              {r.ok ? <CheckCircle2 className="size-5 text-success" />
                : r.blocking === false ? <Info className="size-5 text-muted-foreground" />
                : <XCircle className="size-5 text-destructive" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-subhead">{r.label}</span>
              {!r.ok && r.blocking !== false && r.names.length > 0 && <span className="block text-footnote text-destructive">{r.names.join(", ")}</span>}
              {!r.ok && r.blocking === false && <span className="block text-footnote text-muted-foreground">Se exige al batallar, no al registrar</span>}
            </span>
            <span className="sr-only">{r.ok ? "Cumple" : r.blocking === false ? "Informativa" : "No cumple"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PendingDot() {
  return <Circle className="size-3 text-muted-foreground" aria-hidden />;
}
