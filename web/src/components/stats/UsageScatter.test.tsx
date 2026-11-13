import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { leerFuente } from "@/styles/source";
import { fichaHref } from "@/lib/stats-links";
import { scatterPoints } from "./scatter-data";
import { UsageScatter } from "./UsageScatter";

const row = (species: string, pick: number | null, wr: number | null) =>
  ({ species, used: 4, pick_pct: pick, brought: 4, bring_pct: pick, win_rate_pct: wr, avg_mvp: 1, avg_kills: 1, survival_pct: 50 });

describe("scatterPoints", () => {
  it("excluye las especies sin win rate o sin pick % y conserva el nombre con forma", () => {
    const pts = scatterPoints([row("Scizor-Mega", 40, 62), row("Gengar", 20, null), row("Dragonite", null, 50), row("Togekiss", 10, 45)]);
    expect(pts.map((p) => p.species)).toEqual(["Scizor-Mega", "Togekiss"]);
    expect(pts[0]).toEqual({ species: "Scizor-Mega", pick: 40, wr: 62, used: 4 });
  });

  it("la ficha de una especie con forma conserva la temporada", () => {
    expect(fichaHref("Scizor-Mega", 2)).toBe("/stats/pokemon/Scizor-Mega?temporada=2");
    expect(fichaHref("Scizor-Mega", "active")).toBe("/stats/pokemon/Scizor-Mega");
  });
});

describe("UsageScatter", () => {
  it("es una figura con nombre accesible y una leyenda que explica cómo leerla", () => {
    render(<MemoryRouter><UsageScatter rows={[row("Scizor-Mega", 40, 62)]} temporada="active" /></MemoryRouter>);
    expect(screen.getByRole("figure", { name: "Uso contra win rate de los pokémon" })).toBeInTheDocument();
    expect(screen.getByText(/arriba a la derecha/)).toBeInTheDocument();
  });
});

describe("UsageScatter (guardas de fuente)", () => {
  const src = () => leerFuente("components/stats/UsageScatter.tsx");

  it("distingue win rate < 50 % también por forma, no solo por color", () => {
    expect(src()).toMatch(/shape="triangle"/);
  });

  it("los ticks usan las constantes de tipografía, no números sueltos", () => {
    expect(src()).toMatch(/TICK_CAPTION/);
    expect(src()).not.toMatch(/fontSize:\s*1[0-9]\b/);
  });
});
