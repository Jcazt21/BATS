import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { mockViewport } from "@/lib/test-utils";
import { PokemonUsageTable } from "./PokemonUsageTable";

vi.mock("@/lib/queries", () => ({
  useDexEssentials: () => ({ isSuccess: true, data: { species: { gengar: { name: "Gengar", types: ["Ghost", "Poison"] } }, items: {}, meta: {} } }),
}));

const query = {
  isPending: false,
  refetch: () => undefined,
  data: { total_slots: 10, species: [{ species: "Gengar", used: 5, pick_pct: 50, brought: 6, bring_pct: 60, win_rate_pct: 40, avg_mvp: 1, avg_kills: 1, survival_pct: 50 }] },
};
const href = (temporada?: Parameters<typeof PokemonUsageTable>[0]["temporada"]) => {
  const { unmount } = render(<MemoryRouter><PokemonUsageTable query={query} temporada={temporada} /></MemoryRouter>);
  const link = within(screen.getByRole("table")).getByRole("link").getAttribute("href");
  unmount();
  return link;
};

beforeEach(() => mockViewport(true));

describe("PokemonUsageTable · enlace a la ficha", () => {
  it("con la temporada activa no agrega query", () => {
    expect(href()).toBe("/stats/pokemon/Gengar");
    expect(href("active")).toBe("/stats/pokemon/Gengar");
  });

  it("conserva la temporada elegida (una concreta o todas) para que la ficha muestre la misma", () => {
    expect(href(2)).toBe("/stats/pokemon/Gengar?temporada=2");
    expect(href("all")).toBe("/stats/pokemon/Gengar?temporada=all");
  });
});

describe("PokemonUsageTable · supervivencia", () => {
  it("muestra la columna Supervivencia con pct(survival_pct, 1) y un guion si no hay dato", () => {
    const { unmount } = render(<MemoryRouter><PokemonUsageTable query={query} /></MemoryRouter>);
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByRole("columnheader", { name: /Supervivencia/ })).toBeInTheDocument();
    expect(within(tabla).getByRole("cell", { name: "50%" })).toBeInTheDocument();
    unmount();
    const sinDato = { ...query, data: { ...query.data, species: [{ ...query.data.species[0], survival_pct: null }] } };
    render(<MemoryRouter><PokemonUsageTable query={sinDato} /></MemoryRouter>);
    expect(within(screen.getByRole("table")).getByRole("cell", { name: "—" })).toBeInTheDocument();
  });
});
