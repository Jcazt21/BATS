import { cn } from "@/lib/utils";

/** Barra de porcentaje. El color no es la única señal: el valor va siempre escrito al lado. */
export function Meter({ value, max = 100, tone = "primary", className, label }: {
  value: number | null | undefined;
  max?: number;
  tone?: "primary" | "success" | "warning" | "destructive";
  className?: string;
  label: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const bg = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", destructive: "bg-destructive" }[tone];
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}
    >
      {/* Se desplaza en vez de cambiar de ancho: solo compositor, sin recalcular layout por frame. */}
      <div className={cn("h-full w-full rounded-full transition-transform duration-500 ease-out", bg)} style={{ transform: `translateX(${pct - 100}%)` }} />
    </div>
  );
}
