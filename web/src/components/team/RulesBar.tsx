import { useState } from "react";
import { CheckCircle2, ChevronUp, Info, XCircle } from "lucide-react";
import type { ChecklistRow } from "@/lib/api";
import { ResponsiveSheet } from "@/components/app/ResponsiveSheet";
import { ruleStatus, type RuleStatus } from "@/lib/dex/ruleStatus";
import type { SpeciesFilters } from "@/lib/dex/snapshot";
import type { RuleSeason } from "@/lib/dex/validate";
import { isPokemonType } from "@/lib/pokemon-types";
import { cn } from "@/lib/utils";

interface Props {
  rows: ChecklistRow[];
  season: RuleSeason;
  /** Sin pokémon todavía: las reglas se muestran sin cumplir, pero sin alarma. */
  empty?: boolean;
  /** Una chip fallida con acción pide abrir el buscador con este filtro. */
  onAction?: (filters: SpeciesFilters) => void;
  /** Contenido extra de la hoja móvil (p. ej. la cobertura de tipos). */
  sheetExtra?: React.ReactNode;
  /** Dentro de una hoja el `fixed` queda atrapado por el transform: la barra va en línea. */
  inline?: boolean;
}

function StateIcon({ state }: { state: RuleStatus["state"] }) {
  // La clave cambia con el estado: el icono nuevo se remonta y entra con un fundido de 150ms.
  return (
    <span key={state} data-status-icon className="shrink-0 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
      {state === "pass" ? <CheckCircle2 className="size-4 text-success" aria-hidden />
        : state === "info" ? <Info className="size-4 text-muted-foreground" aria-hidden />
        : <XCircle className="size-4 text-destructive" aria-hidden />}
    </span>
  );
}

const STATE_TEXT: Record<RuleStatus["state"], string> = { pass: "Cumple", fail: "Falta", info: "Informativa" };

/** El tipo del mes va primero, con el acento del mes. */
function ordered(statuses: RuleStatus[]): RuleStatus[] {
  return [...statuses].sort((a, b) => Number(b.rule === "type_of_month") - Number(a.rule === "type_of_month"));
}

/**
 * Reglas del mes siempre a la vista: una chip por regla con estado (icono + texto, no solo
 * color) y, si falta algo que un pokémon nuevo resuelve, la chip es un botón que abre el
 * buscador con el filtro. En móvil se reduce a un chip "N/M reglas" que abre una hoja.
 */
export function RulesBar({ rows, season, empty, onAction, sheetExtra, inline }: Props) {
  const [open, setOpen] = useState(false);
  const statuses = ordered(rows.map((r) => ruleStatus(r, season)));
  const passed = statuses.filter((s) => s.state === "pass").length;
  const month = season.type_of_month?.toLowerCase();
  const monthClass = month && isPokemonType(month) ? `type-${month}` : undefined;

  const counter = (
    <span role="status" aria-live="polite" className="font-mono text-footnote tabular-nums text-muted-foreground">
      {passed}/{statuses.length}
      <span className="sr-only"> reglas cumplidas</span>
    </span>
  );

  function chip(s: RuleStatus) {
    const accent = s.rule === "type_of_month" && monthClass;
    const body = (
      <>
        <StateIcon state={s.state} />
        <span>{s.state === "fail" && !empty ? `Falta ${s.short}` : s.short}</span>
        <span className="sr-only">: {STATE_TEXT[s.state]}</span>
      </>
    );
    const cls = cn(
      "inline-flex items-center gap-1.5 rounded-full px-3 text-footnote font-medium ring-1 ring-border",
      accent ? cn(monthClass, "ring-0") : "bg-card",
    );
    if (s.state === "fail" && s.action && onAction) {
      const { filters } = s.action;
      return (
        <button key={s.rule} type="button" title={s.action.label} onClick={() => onAction(filters)}
          className={cn(cls, "press min-h-11 outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
          {body}
        </button>
      );
    }
    return <span key={s.rule} className={cn(cls, "min-h-8")}>{body}</span>;
  }

  return (
    <section aria-label="Reglas de la temporada">
      {/* Escritorio: chips en una fila. */}
      <div className="hidden items-center gap-2 overflow-x-auto md:flex">
        <ul className="flex flex-1 flex-wrap items-center gap-2">
          {statuses.map((s) => <li key={s.rule}>{chip(s)}</li>)}
        </ul>
        {counter}
      </div>

      {/* Móvil: un chip que abre la hoja. Por encima del TabBar (z-40, alto ~3.5rem + safe area). */}
      <div
        className={cn(
          "md:hidden",
          inline
            ? "flex justify-center"
            : "material-regular material-edge-top fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 py-2",
        )}
      >
        <button type="button" onClick={() => setOpen(true)}
          className="press flex min-h-11 w-full max-w-md items-center justify-between gap-2 rounded-full bg-card px-4 text-subhead ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>Reglas</span>
          <span className="flex items-center gap-2">{counter}<ChevronUp className="size-4" aria-hidden /></span>
        </button>
      </div>

      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Reglas del mes" description={`${passed} de ${statuses.length} cumplidas`}>
        <ul className="flex flex-col divide-y divide-separator">
          {statuses.map((s) => (
            <li key={s.rule} className="flex items-start gap-3 py-3">
              <span className="mt-0.5"><StateIcon state={s.state} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-subhead">{s.label}<span className="sr-only">: {STATE_TEXT[s.state]}</span></span>
                {s.state === "fail" && s.note && <span className="block text-footnote text-muted-foreground">{s.note}</span>}
              </span>
              {s.state === "fail" && s.action && onAction && (
                <button type="button" onClick={() => { setOpen(false); onAction(s.action!.filters); }}
                  className="press min-h-11 shrink-0 rounded-full bg-primary/10 px-3 text-footnote font-medium text-primary">
                  {s.action.label}
                </button>
              )}
            </li>
          ))}
        </ul>
        {sheetExtra}
      </ResponsiveSheet>
    </section>
  );
}
