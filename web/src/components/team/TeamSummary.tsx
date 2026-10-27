import { Check, Clock, TriangleAlert } from "lucide-react";
import { TypeBadge } from "@/components/app/TypeBadge";
import { LoadingState } from "@/components/app/States";
import { Badge } from "@/components/ui/badge";
import type { RosterValidation } from "@/lib/api";
import { parseTypes } from "@/lib/pokemon-types";

/** Estado del equipo de un vistazo: si Showdown lo da por válido (y cuántos errores) y qué tipos cubre. */
export function TeamSummary({ mons, validation, loading }: {
  mons: { name: string; types?: string | null }[];
  validation: RosterValidation | undefined;
  loading?: boolean;
}) {
  if (loading) {
    return <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border"><LoadingState rows={1} /></div>;
  }
  const tipos = [...new Set(mons.flatMap((m) => parseTypes(m.types)))];
  const n = validation?.errors.length ?? 0;
  return (
    <section aria-label="Resumen del equipo" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      {validation?.state === "ok" && <Badge variant="success"><Check /> Válido</Badge>}
      {validation?.state === "errors" && <Badge variant="destructive"><TriangleAlert /> {n} {n === 1 ? "error" : "errores"}</Badge>}
      {(!validation || validation.state === "pending") && <Badge variant="secondary"><Clock /> Pendiente de revisión</Badge>}
      {mons.length === 0 ? (
        <span className="text-footnote text-muted-foreground">Sin pokémon todavía</span>
      ) : (
        <ul aria-label="Tipos del equipo" className="flex flex-wrap gap-1">
          {tipos.map((t) => <li key={t}><TypeBadge type={t} /></li>)}
        </ul>
      )}
    </section>
  );
}
