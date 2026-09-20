import type { RestrictionSpec } from "@/lib/api";

export function RestrictionField({
  rkey,
  spec,
  value,
  onChange,
}: {
  rkey:     string;
  spec:     RestrictionSpec;
  value:    unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  if (spec.values) {
    const current = (value as string | null | undefined) ?? null;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`r_${rkey}`} className="text-xs font-medium">{spec.label}</label>
        <select
          id={`r_${rkey}`}
          value={current ?? ""}
          onChange={(e) => onChange(rkey, e.target.value || null)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {spec.nullable && <option value="">Sin restricción</option>}
          {spec.values.map((v) => (
            <option key={v} value={v} className="capitalize">
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{spec.hint}</p>
      </div>
    );
  }

  if (spec.min !== undefined && spec.max !== undefined) {
    const current = (value as number | null | undefined) ?? null;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`r_${rkey}`} className="text-xs font-medium">{spec.label}</label>
        <select
          id={`r_${rkey}`}
          value={current ?? ""}
          onChange={(e) => onChange(rkey, e.target.value ? Number(e.target.value) : null)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {spec.nullable && <option value="">Sin restricción</option>}
          {Array.from({ length: spec.max - spec.min + 1 }, (_, i) => spec.min! + i).map((n) => (
            <option key={n} value={n}>Generación {n}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{spec.hint}</p>
      </div>
    );
  }

  // bool toggle
  const current = (value as boolean | undefined) ?? (spec.default ?? false);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium">{spec.label}</span>
        <span className="text-xs text-muted-foreground">{spec.hint}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={current}
        onClick={() => onChange(rkey, !current)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${current ? "bg-primary" : "bg-input"}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${current ? "translate-x-4" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}
