import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TypeCoveragePanel } from "./TypeCoveragePanel";
import { coverageSummary } from "@/lib/dex/coverage";
import { POKEMON_TYPES } from "@/lib/pokemon-types";
import type { CoverageRow } from "@/lib/dex/coverage";

const rows = (over: Record<string, Partial<CoverageRow>> = {}): CoverageRow[] =>
  POKEMON_TYPES.map((type) => ({ type, weak: [], resist: [], immune: [], sharedWeakness: false, ...over[type] }));

const ICE = { ice: { weak: ["Dragonite", "Garchomp"], sharedWeakness: true } };

describe("TypeCoveragePanel", () => {
  it("con el equipo vacío explica qué verás en vez de una tira apagada", () => {
    render(<TypeCoveragePanel rows={rows()} empty />);
    expect(screen.getByText("Aún no hay cobertura")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("muestra los 18 tipos, cada uno con su conteo débil/resiste/inmune", () => {
    render(<TypeCoveragePanel rows={rows({ ground: { immune: ["Corviknight"], resist: ["X"] }, ice: ICE.ice })} />);
    expect(screen.getAllByRole("button")).toHaveLength(18);
    expect(screen.getByRole("button", { name: "Tierra: 0 débiles, 1 resisten, 1 inmunes" })).toBeInTheDocument();
  });

  it("rojo/verde llevan signo (▲/▼), no solo color", () => {
    render(<TypeCoveragePanel rows={rows(ICE)} />);
    const ice = screen.getByRole("button", { name: /^Hielo/ });
    expect(ice).toHaveTextContent("▲2");
    expect(ice).toHaveTextContent("▼0");
  });

  it("2+ débiles y 0 resistentes se marca 'sin respuesta'", () => {
    const { rerender } = render(<TypeCoveragePanel rows={rows(ICE)} />);
    expect(screen.getByText(/sin respuesta/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Hielo.*sin respuesta/ })).toBeInTheDocument();
    rerender(<TypeCoveragePanel rows={rows({ ice: { ...ICE.ice, resist: ["Corviknight"] } })} />);
    expect(screen.queryByText(/sin respuesta/)).toBeNull();
  });

  it("tocar un tipo despliega qué integrantes lo afectan (disclosure accesible)", async () => {
    const user = userEvent.setup();
    render(<TypeCoveragePanel rows={rows({ ice: { ...ICE.ice, resist: ["Corviknight"] } })} />);
    const btn = screen.getByRole("button", { name: /^Hielo/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    const detail = document.getElementById(btn.getAttribute("aria-controls")!)!;
    expect(within(detail).getByText("Dragonite, Garchomp")).toBeInTheDocument();
    expect(within(detail).getByText("Corviknight")).toBeInTheDocument();
    expect(detail).not.toHaveAttribute("role", "tooltip");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("coverageSummary resume lo peor en una línea (o nada)", () => {
    expect(coverageSummary(rows())).toBeNull();
    expect(coverageSummary(rows(ICE))).toBe("2 débiles a Hielo");
  });
});
