import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  /** Si existe, el mosaico entero es un enlace a su detalle. */
  to?: string;
  className?: string;
}

/** Mosaico de una métrica: el número manda, el resto acompaña. */
export function StatTile({ label, value, hint, icon, loading, to, className }: Props) {
  // El número sustituye al esqueleto con un fundido; si ya estaba en caché, aparece sin más.
  const [startedLoading] = useState(!!loading);
  const cls = cn(
    "flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border",
    to && "press outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-footnote font-medium">{label}</span>
        {icon}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <span className={cn("tabular text-title1 text-foreground", startedLoading && "animate-in fade-in-0 duration-300")}>{value}</span>
      )}
      {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </>
  );
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}
