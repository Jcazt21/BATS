const nf1 = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" });
const dateShort = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

export const num = (n: number | null | undefined, digits: 0 | 1 | 2 = 0): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return digits === 0 ? String(Math.round(n)) : (digits === 1 ? nf1 : nf2).format(n);
};

export const pct = (n: number | null | undefined, digits: 0 | 1 = 0): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : `${digits ? nf1.format(n) : Math.round(n)}%`;

export const fmtDate = (iso: string | null | undefined): string => (iso ? date.format(new Date(iso)) : "—");
export const fmtDateShort = (iso: string | null | undefined): string => (iso ? dateShort.format(new Date(iso)) : "—");

/** Iniciales para un avatar: "PGL-Bot" → "PB", "ash" → "AS". */
export function initials(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Tono estable (0–5) por nombre, para colorear avatares sin base de datos de colores. */
export function hueIndex(name: string, buckets = 6): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % buckets;
}

/** "hoy", "ayer" o la fecha corta. `now` se inyecta para poder probarlo. */
export function haceCuanto(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const then = new Date(iso);
  const diff = Math.round((day(now) - Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate())) / 86_400_000);
  if (diff <= 0) return "hoy";
  if (diff === 1) return "ayer";
  return fmtDateShort(iso);
}

/** Variación de los últimos 7 días frente a los 7 previos ("+18%", "−5%"); sin base previa, el conteo a secas; sin actividad, "". */
export function variacionSemanal(last7?: number, prev7?: number): string {
  const last = last7 ?? 0;
  const prev = prev7 ?? 0;
  if (prev > 0) return `${last >= prev ? "+" : "−"}${Math.round((Math.abs(last - prev) / prev) * 100)}%`;
  return last > 0 ? `+${last} esta semana` : "";
}
