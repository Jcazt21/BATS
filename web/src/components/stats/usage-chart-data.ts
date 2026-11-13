import type { PokedexRow } from "@/lib/api";

export interface UsageBar { species: string; uso: number; wr: number }

/** Los 10 pokémon más usados (batallas en que salieron), con su pick % y win rate. */
export function usageChartData(rows: PokedexRow[]): UsageBar[] {
  return [...rows]
    .sort((a, b) => b.used - a.used)
    .slice(0, 10)
    .map((r) => ({ species: r.species, uso: Number(r.pick_pct ?? 0), wr: Number(r.win_rate_pct ?? 0) }));
}
