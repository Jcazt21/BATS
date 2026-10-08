import { describe, expect, it } from "vitest";
import { computeTypeCoverage, multiplierAgainst } from "./coverage";
import type { DexEssentials, Species } from "./snapshot";
import type { BuilderMon } from "./validate";

function species(id: string, name: string, types: string[]): Species {
  return {
    id, name, types, num: 1, bst: 300, baseStats: {}, color: "Red", eggGroups: [], gen: 1,
    tags: [], abilities: [], spriteid: id, baseSpecies: name, forme: null, prevo: null,
    isNonstandard: null, restricted: false, paradox: false, ultraBeast: false,
    pseudo: false, leagueLegal: true,
  };
}

const DEX: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 3, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: {
    dragonite: species("dragonite", "Dragonite", ["Dragon", "Flying"]),
    garchomp: species("garchomp", "Garchomp", ["Dragon", "Ground"]),
    corviknight: species("corviknight", "Corviknight", ["Flying", "Steel"]),
  },
  items: {},
};

const mon = (name: string): BuilderMon => ({ species: name, moves: [], evs: {}, ivs: {} });

describe("multiplierAgainst", () => {
  it("multiplica debilidades y resistencias dobles", () => {
    expect(multiplierAgainst("ice", ["dragon", "flying"])).toBe(4);
    expect(multiplierAgainst("fire", ["fire", "water"])).toBe(0.25);
  });
  it("la inmunidad anula cualquier otro factor", () => {
    expect(multiplierAgainst("ground", ["flying", "normal"])).toBe(0);
  });
  it("devuelve uno si el ataque es neutral", () => {
    expect(multiplierAgainst("normal", ["water"])).toBe(1);
  });
});

describe("computeTypeCoverage", () => {
  it("marca una debilidad compartida para dos especies", () => {
    const ice = computeTypeCoverage(DEX, [mon("dragonite"), mon("garchomp")]).find((row) => row.type === "ice")!;
    expect(ice.weak).toEqual(["Dragonite", "Garchomp"]);
    expect(ice.sharedWeakness).toBe(true);
  });
  it("no la marca si solo afecta a una especie", () => {
    const ice = computeTypeCoverage(DEX, [mon("dragonite"), mon("corviknight")]).find((row) => row.type === "ice")!;
    expect(ice.weak).toEqual(["Dragonite"]);
    expect(ice.sharedWeakness).toBe(false);
  });
  it("ignora especies que no existen", () => {
    expect(computeTypeCoverage(DEX, [mon("missingno")]).every((row) => row.weak.length === 0)).toBe(true);
  });
});
