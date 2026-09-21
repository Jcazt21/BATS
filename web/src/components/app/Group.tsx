import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Lista agrupada "inset": una tarjeta con filas separadas por líneas finas (como Ajustes en iOS). */
export function Group({ title, footer, children, className }: {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      {title && <h2 className="px-1 text-footnote font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>}
      <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border [&>*+*]:border-t [&>*+*]:border-separator">
        {children}
      </div>
      {footer && <p className="px-1 text-caption text-muted-foreground">{footer}</p>}
    </section>
  );
}

export function GroupRow({ leading, title, subtitle, trailing, onClick, className }: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-subhead text-foreground">{title}</span>
        {subtitle && <span className="block truncate text-footnote text-muted-foreground">{subtitle}</span>}
      </span>
      {trailing}
    </>
  );
  const cls = cn("flex min-h-12 w-full items-center gap-3 px-4 py-2.5", className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "press transition-colors hover:bg-muted/60 active:bg-muted")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
