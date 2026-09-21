import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Texto pequeño sobre el título (sección, temporada...). */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Título grande estilo iOS: jerarquía por tamaño y peso, con tracking apretado. */
export function PageHeader({ title, subtitle, eyebrow, actions, className }: Props) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-footnote font-medium text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-title1 text-foreground sm:text-display">{title}</h1>
        {subtitle && <p className="mt-2 max-w-prose text-body text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
