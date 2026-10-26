import type { RestrictionSpec } from "@/lib/api";
import { cn } from "@/lib/utils";

const selectCls = "h-10 w-full rounded-xl border border-input bg-card px-3 text-subhead outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

/** Etiqueta de cada opción numérica según la regla (la generación no es lo mismo que un tope). */
function numberLabel(rkey: string, spec: RestrictionSpec, n: number): string {
  if (rkey === "required_generation") return `Generación ${n}`;
  if (rkey.startsWith("max_") && n === spec.max) return `${n} (sin límite)`;
  return String(n);
}

/** Campo de una restricción, generado a partir de su spec: enum → lista, entero → lista, bool → interruptor. */
export function RestrictionField({ rkey, spec, value, onChange }: {
  rkey: string; spec: RestrictionSpec; value: unknown; onChange: (key: string, val: unknown) => void;
}) {
  const id = `r_${rkey}`;

  if (spec.values) {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-footnote font-medium">{spec.label}</label>
        <select id={id} value={(value as string | null | undefined) ?? ""} onChange={(e) => onChange(rkey, e.target.value || null)} className={selectCls}>
          {spec.nullable && <option value="">Sin restricción</option>}
          {spec.values.map((v) => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
        </select>
        <p className="text-caption text-muted-foreground">{spec.hint}</p>
      </div>
    );
  }

  if (spec.min !== undefined && spec.max !== undefined) {
    const current = (value as number | null | undefined) ?? (spec.nullable ? null : spec.max);
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-footnote font-medium">{spec.label}</label>
        <select id={id} value={current ?? ""} onChange={(e) => onChange(rkey, e.target.value ? Number(e.target.value) : null)} className={selectCls}>
          {spec.nullable && <option value="">Sin restricción</option>}
          {Array.from({ length: spec.max - spec.min + 1 }, (_, i) => spec.min! + i).map((n) => (
            <option key={n} value={n}>{numberLabel(rkey, spec, n)}</option>
          ))}
        </select>
        <p className="text-caption text-muted-foreground">{spec.hint}</p>
      </div>
    );
  }

  const on = (value as boolean | undefined) ?? (spec.default ?? false);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span id={`${id}_l`} className="block text-footnote font-medium">{spec.label}</span>
        <span className="block text-caption text-muted-foreground">{spec.hint}</span>
      </div>
      {/* Interruptor estilo iOS: 51×31 pt, objetivo táctil holgado */}
      <button
        type="button" role="switch" aria-checked={on} aria-labelledby={`${id}_l`}
        onClick={() => onChange(rkey, !on)}
        className={cn("press relative inline-flex h-[1.9375rem] w-[3.1875rem] shrink-0 rounded-full p-0.5 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-success" : "bg-input")}
      >
        <span className={cn("block size-[1.6875rem] rounded-full bg-white shadow-md transition-transform duration-200 ease-ios", on ? "translate-x-[1.25rem]" : "translate-x-0")} />
      </button>
    </div>
  );
}
