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
