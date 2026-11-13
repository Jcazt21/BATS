import { describe, expect, it } from "vitest";
import { buildCollection, collectionProgress, filterCollection, groupByTypes, type DexFilters } from "./collection";
import type { DexEssentials, Species } from "./snapshot";
import type { PokedexSighting } from "@/lib/api";

function sp(id: string, name: string, num: number, extra: Partial<Species> = {}): Species {
  return {
    id, name, num, types: ["Normal"], bst: 300, baseStats: {}, color: "Red", eggGroups: [], gen: 1,
    tags: [], abilities: [], spriteid: id, baseSpecies: name, forme: null, prevo: null,
    isNonstandard: null, restricted: false, paradox: false, ultraBeast: false, pseudo: false, leagueLegal: true,
    ...extra,
  };
}

const SPECIES: Species[] = [
  sp("charmander", "Charmander", 4, { types: ["Fire"] }),
  sp("charmeleon", "Charmeleon", 5, { types: ["Fire"], prevo: "Charmander" }),
  sp("charizard", "Charizard", 6, { types: ["Fire", "Flying"], prevo: "Charmeleon" }),
  sp("charizardmegax", "Charizard-Mega-X", 6, { types: ["Fire", "Dragon"], baseSpecies: "Charizard", forme: "Mega-X" }),
  sp("charizardmegay", "Charizard-Mega-Y", 6, { types: ["Fire", "Flying"], baseSpecies: "Charizard", forme: "Mega-Y" }),
  sp("pikachu", "Pikachu", 25, { types: ["Electric"] }),
  sp("raichu", "Raichu", 26, { types: ["Electric"], prevo: "Pikachu" }),
  sp("raichualola", "Raichu-Alola", 26, { types: ["Electric", "Psychic"], baseSpecies: "Raichu", forme: "Alola", prevo: "Pikachu" }),
  sp("garchomp", "Garchomp", 445, { types: ["Dragon", "Ground"], gen: 4 }),
  sp("missingno", "MissingNo.", 0),
];

const DEX: DexEssentials = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: SPECIES.length, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: Object.fromEntries(SPECIES.map((s) => [s.id, s])),
  items: {},
};

const seen = (species: string, at = "2026-11-10T00:00:00Z", opponent = "bea"): PokedexSighting => ({
  species_id: species.toLowerCase().replace(/[^a-z0-9]/g, ""), species, first_seen_at: at, battle_id: `b-${species}`, opponent,
});

const ALL: DexFilters = { query: "", status: "all", types: [], gen: null };
const cell = (cells: ReturnType<typeof buildCollection>, num: number) => cells.find((c) => c.num === num)!;

describe("buildCollection", () => {
  it("una casilla por número nacional, ordenadas, sin números <= 0", () => {
    const cells = buildCollection(DEX, []);
    expect(cells.map((c) => c.num)).toEqual([4, 5, 6, 25, 26, 445]);
    expect(cell(cells, 6).species.name).toBe("Charizard");
    expect(cells.every((c) => c.status === "unknown")).toBe(true);
  });

  it("ver una forma descubre su número y la lista en seenForms", () => {
    const c = cell(buildCollection(DEX, [seen("Charizard-Mega-X")]), 6);
    expect(c.status).toBe("seen");
    expect(c.seenForms).toEqual(["Charizard-Mega-X"]);
    expect(c.firstSeen).toEqual({ at: "2026-11-10T00:00:00Z", battleId: "b-Charizard-Mega-X", opponent: "bea", species: "Charizard-Mega-X" });
  });

  it("descubre la cadena de preevoluciones hacia atrás, no hacia adelante", () => {
    const cells = buildCollection(DEX, [seen("Charmeleon")]);
    expect(cell(cells, 4)).toMatchObject({ status: "evolution", via: "Charmeleon" });
    expect(cell(cells, 5).status).toBe("seen");
    expect(cell(cells, 6).status).toBe("unknown");
  });

  it("una mega sin prevo propio hereda la cadena de su especie base", () => {
    const cells = buildCollection(DEX, [seen("Charizard-Mega-Y")]);
    expect(cell(cells, 5)).toMatchObject({ status: "evolution", via: "Charizard-Mega-Y" });
    expect(cell(cells, 4)).toMatchObject({ status: "evolution", via: "Charizard-Mega-Y" });
  });

  it("visto en batalla gana sobre descubierto por evolución", () => {
    const cells = buildCollection(DEX, [seen("Charizard"), seen("Charmander")]);
    expect(cell(cells, 4).status).toBe("seen");
    expect(cell(cells, 5).status).toBe("evolution");
  });

  it("una forma regional descubre su preevolución", () => {
    expect(cell(buildCollection(DEX, [seen("Raichu-Alola")]), 25)).toMatchObject({ status: "evolution", via: "Raichu-Alola" });
  });

  it("via es la especie vista primero cuando dos llevan a la misma preevolución", () => {
    const cells = buildCollection(DEX, [
      seen("Charizard", "2026-11-12T00:00:00Z"),
      seen("Charmeleon", "2026-11-05T00:00:00Z"),
    ]);
    expect(cell(cells, 4).via).toBe("Charmeleon");
  });

  it("firstSeen de una casilla con varias formas es el avistamiento más antiguo", () => {
    const c = cell(buildCollection(DEX, [
      seen("Charizard-Mega-X", "2026-11-12T00:00:00Z"),
      seen("Charizard", "2026-11-03T00:00:00Z"),
    ]), 6);
    expect(c.firstSeen?.species).toBe("Charizard");
    expect(c.seenForms.sort()).toEqual(["Charizard", "Charizard-Mega-X"]);
  });

  it("una especie que no está en el dex se ignora", () => {
    const cells = buildCollection(DEX, [seen("Fakemon"), seen("Garchomp")]);
    expect(cells).toHaveLength(6);
    expect(collectionProgress(cells).discovered).toBe(1);
  });
});

describe("filterCollection", () => {
  const cells = buildCollection(DEX, [seen("Charmeleon"), seen("Garchomp")]);

  it("buscar por nombre solo encuentra descubiertos", () => {
    expect(filterCollection(cells, { ...ALL, query: "chari" })).toEqual([]);
    expect(filterCollection(cells, { ...ALL, query: "charm" }).map((c) => c.num)).toEqual([4, 5]);
    expect(filterCollection(cells, { ...ALL, query: "GARCHOMP" }).map((c) => c.num)).toEqual([445]);
  });

  it("buscar por número encuentra cualquiera, con o sin # y ceros", () => {
    for (const q of ["6", "#006", "006", " #6 "]) {
      expect(filterCollection(cells, { ...ALL, query: q }).map((c) => c.num)).toEqual([6]);
    }
  });

  it("filtro de estado: discovered incluye seen y evolution", () => {
    expect(filterCollection(cells, { ...ALL, status: "discovered" }).map((c) => c.num)).toEqual([4, 5, 445]);
    expect(filterCollection(cells, { ...ALL, status: "seen" }).map((c) => c.num)).toEqual([5, 445]);
    expect(filterCollection(cells, { ...ALL, status: "evolution" }).map((c) => c.num)).toEqual([4]);
    expect(filterCollection(cells, { ...ALL, status: "unknown" }).map((c) => c.num)).toEqual([6, 25, 26]);
  });

  it("tipo, generación y estado se combinan con AND", () => {
    expect(filterCollection(cells, { ...ALL, types: ["fire"] }).map((c) => c.num)).toEqual([4, 5, 6]);
    expect(filterCollection(cells, { ...ALL, types: ["dragon"], gen: 4 }).map((c) => c.num)).toEqual([445]);
    expect(filterCollection(cells, { ...ALL, types: ["fire"], status: "unknown" }).map((c) => c.num)).toEqual([6]);
  });

  it("con dos tipos muestra los que tienen cualquiera de ellos (OR)", () => {
    expect(filterCollection(cells, { ...ALL, types: ["flying", "dragon"] }).map((c) => c.num)).toEqual([6, 445]);
  });
});

describe("collectionProgress", () => {
  it("cuenta descubiertos, desglose, generaciones y último descubierto", () => {
    const cells = buildCollection(DEX, [
      seen("Charmeleon", "2026-11-05T00:00:00Z"),
      seen("Garchomp", "2026-11-11T00:00:00Z", "ronny"),
    ]);
    const p = collectionProgress(cells);
    expect(p).toMatchObject({ discovered: 3, total: 6, seen: 2, evolution: 1 });
    expect(p.byGen).toEqual([{ gen: 1, discovered: 2, total: 5 }, { gen: 4, discovered: 1, total: 1 }]);
    expect(p.last?.num).toBe(445);
    expect(p.last?.firstSeen?.opponent).toBe("ronny");
  });

  it("sin avistamientos no hay último descubierto", () => {
    expect(collectionProgress(buildCollection(DEX, [])).last).toBeUndefined();
  });
});

describe("groupByTypes", () => {
  const cells = buildCollection(DEX, []);
  const nums = (g: ReturnType<typeof groupByTypes>) => g.map((s) => ({ title: s.title, nums: s.cells.map((c) => c.num) }));

  it("con 0 o 1 tipo es una sola sección sin título", () => {
    expect(nums(groupByTypes(cells, []))).toEqual([{ title: null, nums: [4, 5, 6, 25, 26, 445] }]);
    const fire = filterCollection(cells, { ...ALL, types: ["fire"] });
    expect(nums(groupByTypes(fire, ["fire"]))).toEqual([{ title: null, nums: [4, 5, 6] }]);
  });

  it("con dos tipos: primero la combinación exacta, luego solo uno y solo el otro", () => {
    const both = filterCollection(cells, { ...ALL, types: ["fire", "flying"] });
    expect(nums(groupByTypes(both, ["fire", "flying"]))).toEqual([
      { title: "Fuego y Volador", nums: [6] },
      { title: "Solo Fuego", nums: [4, 5] },
    ]);
  });

  it("omite las secciones vacías", () => {
    const sel = filterCollection(cells, { ...ALL, types: ["electric", "ghost"] });
    expect(nums(groupByTypes(sel, ["electric", "ghost"]))).toEqual([{ title: "Solo Eléctrico", nums: [25, 26] }]);
  });
});
