/** Paginación en el cliente: cálculo de páginas, recorte y ventana de números con elipsis. */

/** Opciones del selector "por página". */
export const PAGE_SIZES = [30, 60, 90, 150] as const;

export type PageItem = number | "gap";

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

export function clampPage(page: number, total: number): number {
  return Math.min(Math.max(page, 1), total);
}

export function paginate<T>(items: T[], page: number, size: number): T[] {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

/**
 * Números a mostrar en el paginador: siempre la primera y la última, la actual con un vecino
 * por lado y "gap" donde se saltan páginas. Siempre devuelve como mucho 7 elementos.
 */
export function pageWindow(current: number, total: number): PageItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "gap", total];
  if (current >= total - 3) return [1, "gap", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "gap", current - 1, current, current + 1, "gap", total];
}
