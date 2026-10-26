import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { abrirMenu } from "@/lib/test-utils";
import { TeamBuilder } from "./TeamBuilder";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";
import type { BuilderMon } from "@/lib/dex/validate";

// SlotBoard NO se mockea: aquí se prueba el marcado real de la lista.
vi.mock("@/lib/dex/useLearnset", () => ({
  useLearnset: () => ({ learnset: [], error: null, retry: () => {} }),
  useLearnsets: () => ({ map: {}, pending: false, error: null, retry: () => {} }),
}));
vi.mock("@/components/builder/SetEditor", () => ({
  SetEditor: ({ mon }: { mon: BuilderMon }) => <div data-testid="editor">{mon.species}</div>,
}));
vi.mock("@/components/builder/SpeciesPicker", () => ({ SpeciesPicker: () => null }));

function species(id: string, name: string, types: string[]): Species {
  return {
    id, name, types, num: 1, bst: 300, baseStats: {}, color: "Blue", eggGroups: [], gen: 1,
    tags: [], abilities: [], spriteid: id, baseSpecies: name, forme: null, prevo: null,
    isNonstandard: null, restricted: false, paradox: false, ultraBeast: false,
    pseudo: false, leagueLegal: true,
  };
}

const dex: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 3, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: {
    dragonite: species("dragonite", "Dragonite", ["Dragon", "Flying"]),
    garchomp: species("garchomp", "Garchomp", ["Dragon", "Ground"]),
    gengar: species("gengar", "Gengar", ["Ghost", "Poison"]),
  },
  items: {},
};

const mon = (name: string): BuilderMon => ({ species: name, moves: [], evs: {}, ivs: {} });
const initial = [mon("Dragonite"), mon("Garchomp"), mon("Gengar")];

function renderBuilder(onSave = vi.fn()) {
  render(<TeamBuilder dex={dex} initial={initial} season={{ restrictions: {} }}
    banned={new Set()} maxSize={6} onSave={onSave} />);
}

describe("TeamBuilder: lista del equipo", () => {
  it("no hay botones anidados ni listas dentro de listas", () => {
    renderBuilder();
    const list = screen.getByRole("list", { name: "Pokémon del equipo" });
    for (const b of within(list).getAllByRole("button")) {
      expect(b.parentElement?.closest("button")).toBeNull();
    }
    expect(list.querySelector("li li")).toBeNull();
    expect(list.querySelector("button button")).toBeNull();
  });

  it("quitar un pokémon anterior al seleccionado conserva el mismo seleccionado", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: /^Gengar/ }));
    expect(screen.getByTestId("editor")).toHaveTextContent("Gengar");
    const list = screen.getByRole("list", { name: "Pokémon del equipo" });
    await abrirMenu(within(list).getAllByRole("button", { name: /Más acciones/ })[0]);
    await user.click(screen.getByRole("menuitem", { name: /Quitar/ }));
    expect(screen.getByTestId("editor")).toHaveTextContent("Gengar");
    expect(screen.getByRole("button", { name: /^Gengar/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("onSave recibe BuilderMon[] planos", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderBuilder(onSave);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith(initial);
  });
});
