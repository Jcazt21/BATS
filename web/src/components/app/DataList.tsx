import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/** Al sustituir al esqueleto, el contenido llega con un fundido breve en vez de un corte seco. */
const ENTER = "animate-in fade-in-0 duration-300";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Si existe, la columna se puede ordenar con este valor. */
  sortValue?: (row: T) => number | string | null | undefined;
  align?: "left" | "right";
  /** En móvil es el título de la tarjeta (solo una por lista). */
  primary?: boolean;
  /** En móvil no se muestra. */
  hideOnMobile?: boolean;
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /** Enlace real de la fila (en la celda principal): permite clic medio / Ctrl+clic para abrir en otra pestaña. */
  rowHref?: (row: T) => string;
  /** Ruta a la que lleva la fila: se precarga (código y datos) en cuanto hay intención de abrirla. */
  rowPrefetch?: (row: T) => string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  loading?: boolean;
  empty?: ReactNode;
  caption: string;
  className?: string;
}

/**
 * Una sola lista de datos con dos presentaciones: tabla en pantallas anchas y tarjetas
 * en el móvil. Sin desplazamiento horizontal y sin duplicar código por página.
 */
export function DataList<T>({ rows, columns, rowKey, onRowClick, rowHref, rowPrefetch, defaultSort, loading, empty, caption, className }: Props<T>) {
  const [sort, setSort] = useState(defaultSort);
  // Solo si esta lista llegó a mostrar el esqueleto: con datos en caché no hay nada que suavizar.
  const [startedLoading] = useState(!!loading);
  const enter = startedLoading ? ENTER : undefined;
  // Entrada escalonada (30ms, máx. 8 filas) solo la primera vez que llegan los datos: ordenar o filtrar no la repite.
  const [stagger, setStagger] = useState(startedLoading);
  useEffect(() => {
    if (!stagger || loading) return;
    const t = window.setTimeout(() => setStagger(false), 800);
    return () => window.clearTimeout(t);
  }, [stagger, loading]);
  const rowAnim = (i: number) => stagger && i < 8
    ? { className: "animate-in fade-in-0 duration-300 fill-mode-backwards", style: { animationDelay: `${i * 30}ms` } }
    : { className: undefined, style: undefined };
  const activate = (e: React.SyntheticEvent, row: T) => {
    if ((e.target as HTMLElement).closest("a")) return; // el enlace ya navega
    onRowClick?.(row);
  };
  const withLink = (row: T, content: ReactNode) =>
    rowHref ? <Link to={rowHref(row)} tabIndex={-1} className="hover:underline">{content}</Link> : content;

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sortValue || !sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = col.sortValue!(a), y = col.sortValue!(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es")) * dir;
    });
  }, [rows, columns, sort]);

  function toggle(col: Column<T>) {
    if (!col.sortValue) return;
    setSort((s) => (s?.key === col.key ? { key: col.key, dir: s.dir === "desc" ? "asc" : "desc" } : { key: col.key, dir: "desc" }));
  }

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", className)} aria-busy>
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}
      </div>
    );
  }
  if (!sorted.length) {
    return <div className={cn("rounded-2xl bg-card shadow-sm ring-1 ring-border", enter, className)}>{empty}</div>;
  }

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const secondary = columns.filter((c) => c !== primary && !c.hideOnMobile);
  const clickable = onRowClick ? "cursor-pointer transition-colors hover:bg-muted/60 active:bg-muted" : "";

  return (
    <div className={cn("overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border", className)}>
      {/* Tarjetas (móvil) */}
      <ul className="divide-y divide-separator md:hidden" aria-label={caption}>
        {sorted.map((row, i) => (
          // Fuera de pantalla no se maqueta ni se pinta: el scroll de listas largas (Pokédex) no se atasca.
          <li key={rowKey(row)} style={rowAnim(i).style} className={cn("[contain-intrinsic-size:auto_5.5rem] [content-visibility:auto]", rowAnim(i).className)}>
            <div
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              data-prefetch={rowPrefetch?.(row)}
              onClick={onRowClick ? (e) => activate(e, row) : undefined}
              onKeyDown={onRowClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRowClick(row)) : undefined}
              className={cn("flex flex-col gap-2 px-4 py-3", clickable)}
            >
              <div className="text-headline">{withLink(row, primary.cell(row))}</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {secondary.map((c) => (
                  <div key={c.key} className="flex min-w-0 flex-col">
                    <dt className="text-caption text-muted-foreground">{c.header}</dt>
                    <dd className="tabular truncate text-subhead">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>

      {/* Tabla (≥ md) */}
      <table className="hidden w-full text-subhead md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-separator text-footnote text-muted-foreground">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn("px-4 py-2.5 font-medium", c.align === "right" ? "text-right" : "text-left", c.className)}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c)}
                      className={cn("inline-flex items-center gap-1 rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", active && "text-foreground")}
                    >
                      {c.header}
                      {active && (sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-separator">
          {sorted.map((row, i) => (
            <tr
              key={rowKey(row)}
              data-prefetch={rowPrefetch?.(row)}
              onClick={onRowClick ? (e) => activate(e, row) : undefined}
              onKeyDown={onRowClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRowClick(row)) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              style={rowAnim(i).style}
              className={cn("outline-none focus-visible:bg-muted", clickable, rowAnim(i).className)}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("tabular px-4 py-3", c.align === "right" && "text-right", c.className)}>
                  {c === primary ? withLink(row, c.cell(row)) : c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
