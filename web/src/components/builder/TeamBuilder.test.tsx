import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeamBuilder } from "./TeamBuilder";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";
import type { BuilderMon } from "@/lib/dex/validate";

vi.mock("@/lib/dex/useLearnset", () => ({ useLearnset: () => [], useLearnsets: () => ({}) }));
vi.mock("@/components/builder/SetEditor", () => ({ SetEditor: () => <div>Editor</div> }));
vi.mock("@/components/builder/SpeciesPicker", () => ({ SpeciesPicker: () => null }));
vi.mock("@/components/team/MonCard", () => ({ MonCard: () => <div>Pokémon</div> }));

function species(id: string, name: string, types: string[]): Species {
  return {
    id, name, types, num: 1, bst: 300, baseStats: {}, color: "Blue", eggGroups: [], gen: 1,
    tags: [], abilities: [], spriteid: id, baseSpecies: name, forme: null, prevo: null,
    isNonstandard: null, restricted: false, paradox: false, ultraBeast: false,
    pseudo: false, leagueLegal: true,
  };
}

const dex: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 2, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: {
    dragonite: species("dragonite", "Dragonite", ["Dragon", "Flying"]),
    garchomp: species("garchomp", "Garchomp", ["Dragon", "Ground"]),
  },
  items: {},
};

const mon = (name: string): BuilderMon => ({ species: name, moves: [], evs: {}, ivs: {} });

describe("TeamBuilder", () => {
  it("muestra la debilidad compartida en los paneles de escritorio y móvil", async () => {
    const user = userEvent.setup();
    render(<TeamBuilder dex={dex} initial={[mon("Dragonite"), mon("Garchomp")]} season={{ restrictions: {} }}
      banned={new Set()} maxSize={6} onSave={vi.fn()} />);
    await user.click(screen.getByText(/reglas cumplidas/));
    const panels = screen.getAllByRole("region", { name: "Cobertura de tipos" });
    expect(panels).toHaveLength(2);
    for (const panel of panels) {
      expect(within(panel).getByText("Hielo")).toBeInTheDocument();
      expect(within(panel).getAllByText(/Dragonite, Garchomp/).length).toBeGreaterThan(0);
    }
  });
});
