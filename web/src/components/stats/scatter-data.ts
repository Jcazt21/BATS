import type { PokedexRow } from "@/lib/api";

export interface ScatterPoint { species: string; pick: number; wr: number; used: number }

/** Puntos de la dispersión uso vs. win rate: solo especies con pick % y win rate conocidos. */
export function scatterPoints(rows: PokedexRow[]): ScatterPoint[] {
  return rows
    .filter((r) => r.pick_pct != null && r.win_rate_pct != null)
    .map((r) => ({ species: r.species, pick: r.pick_pct!, wr: r.win_rate_pct!, used: r.used }));
}
