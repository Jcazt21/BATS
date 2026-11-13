import { describe, expect, it } from "vitest";
import { leerFuente } from "@/styles/source";
import { usageChartData } from "./usage-chart-data";

const row = (species: string, used: number, pick: number | null, wr: number | null) =>
  ({ species, used, pick_pct: pick, brought: used, bring_pct: pick, win_rate_pct: wr, avg_mvp: 1, avg_kills: 1 });

describe("usageChartData", () => {
  it("toma los 10 más usados, de mayor a menor", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`P${i}`, i, i * 2, 50));
    const data = usageChartData(rows);
    expect(data).toHaveLength(10);
    expect(data[0]).toEqual({ species: "P11", uso: 22, wr: 50 });
    expect(data.at(-1)?.species).toBe("P2");
  });

  it("sin pick % o win rate cuenta como 0", () => {
    expect(usageChartData([row("Gengar", 3, null, null)])).toEqual([{ species: "Gengar", uso: 0, wr: 0 }]);
  });
});

describe("PokemonUsageChart (guardas de fuente)", () => {
  const src = () => leerFuente("components/stats/PokemonUsageChart.tsx");

  it("distingue win rate < 50 % también por patrón, no solo por color", () => {
    expect(src()).toMatch(/<pattern/);
    expect(src()).toMatch(/url\(#\$\{BAJO_ID\}\)/);
  });

  it("los ticks usan las constantes de tipografía, no números sueltos", () => {
    expect(src()).toMatch(/TICK_CAPTION/);
    expect(src()).not.toMatch(/fontSize:\s*1[0-9]\b/);
  });
});
