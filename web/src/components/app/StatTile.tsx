import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
}

/** Mosaico de una métrica: el número manda, el resto acompaña. */
export function StatTile({ label, value, hint, icon, loading, className }: Props) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", className)}>
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-footnote font-medium">{label}</span>
        {icon}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <span className="tabular text-title1 text-foreground">{value}</span>
      )}
      {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </div>
  );
}
