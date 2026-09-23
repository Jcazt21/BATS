import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TypeCoveragePanel } from "./TypeCoveragePanel";
import { POKEMON_TYPES } from "@/lib/pokemon-types";
import type { CoverageRow } from "@/lib/dex/coverage";

const rows = (): CoverageRow[] => POKEMON_TYPES.map((type) => ({ type, weak: [], resist: [], immune: [], sharedWeakness: false }));

describe("TypeCoveragePanel", () => {
  it("muestra el estado vacío", () => {
    render(<TypeCoveragePanel rows={rows()} empty />);
    expect(screen.getByText(/Agrega pokémon para ver su cobertura/)).toBeInTheDocument();
  });

  it("muestra el estado sin debilidades compartidas", () => {
    render(<TypeCoveragePanel rows={rows()} />);
    expect(screen.getByText(/Sin debilidades compartidas/)).toBeInTheDocument();
  });

  it("muestra el tipo y las especies débiles", () => {
    const coverage = rows().map((row) => row.type === "ice"
      ? { ...row, weak: ["Dragonite", "Garchomp"], sharedWeakness: true } : row);
    render(<TypeCoveragePanel rows={coverage} />);
    expect(screen.getByText("Hielo")).toBeInTheDocument();
    expect(screen.getByText(/Dragonite, Garchomp/)).toBeInTheDocument();
  });
});
