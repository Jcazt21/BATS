import { Check, X } from "lucide-react";
import { TypeBadges } from "@/components/app/TypeBadge";
import { HomeSection } from "@/components/home/HomeSection";
import type { ChecklistRow } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Tipo del mes y las reglas de la temporada. Con `checked` cada regla dice si mi equipo la
 * cumple; sin él (sin sesión o sin equipo) es solo la lista de condiciones.
 */
export function MonthRulesList({ typeOfMonth, rows, checked, loading }: {
  typeOfMonth?: string | null; rows?: ChecklistRow[]; checked: boolean; loading?: boolean;
}) {
  return (
    <HomeSection title="Tipo del mes" to="/equipo" linkLabel="Mi equipo">
      <div className="pt-3">{typeOfMonth ? <TypeBadges types={typeOfMonth} /> : <p className="text-footnote text-muted-foreground">{loading ? "Cargando…" : "Sin tipo del mes."}</p>}</div>
      <ul className="mt-2 divide-y divide-border">
        {(rows ?? []).map((r) => (
          <li key={r.rule} className="flex items-center gap-2.5 py-2.5 text-subhead">
            <span
              aria-hidden="true"
              className={cn("grid size-5 shrink-0 place-items-center rounded-full",
                !checked ? "bg-secondary text-muted-foreground" : r.ok ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive")}
            >
              {checked ? (r.ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />) : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <span className="min-w-0 flex-1">{r.label}</span>
            {checked && <span className="sr-only">{r.ok ? "Cumple" : "No cumple"}</span>}
            {checked && r.names.length > 0 && <span className="shrink-0 truncate text-footnote text-muted-foreground">{r.names.join(", ")}</span>}
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
