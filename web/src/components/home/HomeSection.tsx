import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Sección sin caja del inicio: título, enlace opcional y una línea fina antes del contenido. */
export function HomeSection({ title, to, linkLabel, children, className }: {
  title: string; to?: string; linkLabel?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section aria-label={title} className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-title3">{title}</h2>
        {to && linkLabel && <Link to={to} className="rounded text-footnote font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">{linkLabel}</Link>}
      </div>
      {children}
    </section>
  );
}
