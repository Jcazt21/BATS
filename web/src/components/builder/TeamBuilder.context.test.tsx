import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeamBuilder } from "./TeamBuilder";
import type { DexEssentials, Species } from "@/lib/dex/snapshot";
import type { BuilderMon, RuleSeason } from "@/lib/dex/validate";

vi.mock("@/lib/dex/useLearnset", () => ({
  useLearnset: () => ({ learnset: [], error: null, retry: () => {} }),
  useLearnsets: () => ({ map: {}, pending: false, error: null, retry: () => {} }),
}));
vi.mock("@/components/builder/SetEditor", () => ({ SetEditor: () => <div>Editor</div> }));
vi.mock("@/components/builder/SpeciesPicker", () => ({ SpeciesPicker: () => null }));

function species(id: string, name: string): Species {
  return {
    id, name, types: ["Normal"], num: 1, bst: 300, baseStats: {}, color: "Blue", eggGroups: [], gen: 1,
    tags: [], abilities: [], spriteid: id, baseSpecies: name, forme: null, prevo: null,
    isNonstandard: null, restricted: false, paradox: false, ultraBeast: false,
    pseudo: false, leagueLegal: true,
  };
}

const dex: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 3, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: { garchomp: species("garchomp", "Garchomp"), gengar: species("gengar", "Gengar"), mew: species("mew", "Mew") },
  items: {},
};

const mon = (name: string): BuilderMon => ({ species: name, moves: [], evs: {}, ivs: {} });

function renderCtx(opts: { context: BuilderMon[]; initial: BuilderMon[]; banned?: string[]; season?: RuleSeason }) {
  render(<TeamBuilder dex={dex} initial={opts.initial} context={opts.context}
    season={opts.season ?? { restrictions: {} }} banned={new Set(opts.banned ?? [])} maxSize={6} onSave={vi.fn()} />);
}

describe("TeamBuilder: modo contexto (agregar/reemplazar)", () => {
  it("un baneado en el contexto no bloquea guardar", () => {
    renderCtx({ context: [mon("Garchomp")], initial: [mon("Gengar")], banned: ["garchomp"] });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("una regla combinada incumplida en el contexto no bloquea", () => {
    renderCtx({ context: [mon("Garchomp")], initial: [mon("Gengar")], season: { restrictions: { required_color: "Red" } } });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("un baneado en el pokémon nuevo sí bloquea", () => {
    renderCtx({ context: [mon("Garchomp")], initial: [mon("Gengar")], banned: ["gengar"] });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("sin contexto (registro) las reglas combinadas siguen bloqueando", () => {
    renderCtx({ context: [], initial: [mon("Gengar")], season: { restrictions: { required_color: "Red" } } });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });
});
