import { describe, expect, it } from "vitest";
import { parseBlock, parsePaste, pokeapiSlug, toPaste } from "./showdown";

const GARCHOMP = `Garchomp @ Rocky Helmet
Ability: Rough Skin
Tera Type: Steel
EVs: 252 HP / 4 Atk / 252 SpD
Impish Nature
- Earthquake
- Dragon Tail
- Stealth Rock
- Spikes`;

describe("parseBlock", () => {
  it("lee un set completo", () => {
    expect(parseBlock(GARCHOMP)).toEqual({
      species: "Garchomp", nickname: undefined, held_item: "Rocky Helmet", ability: "Rough Skin",
      tera_type: "Steel", nature: "Impish", moves: ["Earthquake", "Dragon Tail", "Stealth Rock", "Spikes"],
      evs: { HP: 252, Atk: 4, SpD: 252 }, ivs: {},
    });
  });

  it("separa apodo y especie, y quita el género", () => {
    const m = parseBlock("Chompy (Garchomp) (M) @ Leftovers");
    expect(m?.species).toBe("Garchomp");
    expect(m?.nickname).toBe("Chompy");
    expect(parseBlock("Garchomp (F)")?.species).toBe("Garchomp");
  });

  it("acepta especie sin objeto ni extras", () => {
    expect(parseBlock("Mew")).toMatchObject({ species: "Mew", held_item: undefined, moves: [] });
  });

  it("lee IVs", () => {
    expect(parseBlock("Mew\nIVs: 0 Atk / 30 Spe")?.ivs).toEqual({ Atk: 0, Spe: 30 });
  });

  it("devuelve null con texto vacío", () => {
    expect(parseBlock("  \n ")).toBeNull();
  });

  it("lee género, nivel, shiny y felicidad", () => {
    const m = parseBlock("Garchomp (F) @ Leftovers\nLevel: 50\nShiny: Yes\nHappiness: 0");
    expect(m?.gender).toBe("F");
    expect(m?.level).toBe(50);
    expect(m?.shiny).toBe(true);
    expect(m?.happiness).toBe(0);
  });

  it("shiny ausente o 'No' es false/undefined", () => {
    expect(parseBlock("Garchomp\nShiny: No")?.shiny).toBe(false);
    expect(parseBlock("Garchomp")?.shiny).toBeUndefined();
  });
});

describe("parsePaste", () => {
  it("separa varios pokémon por línea en blanco", () => {
    const team = parsePaste(`${GARCHOMP}\n\nClefable @ Life Orb\n- Moonblast\n\n\nHeatran`);
    expect(team.map((p) => p.species)).toEqual(["Garchomp", "Clefable", "Heatran"]);
  });

  it("ignora bloques vacíos", () => {
    expect(parsePaste("\n\n   \n")).toEqual([]);
  });
});

describe("toPaste", () => {
  it("es el inverso de parseBlock", () => {
    const m = parseBlock(GARCHOMP)!;
    const again = parseBlock(toPaste({ name: m.species, ...m }));
    expect(again).toEqual(m);
  });

  it("escribe género, nivel, shiny y felicidad", () => {
    const paste = toPaste({ name: "Garchomp", gender: "F", level: 50, shiny: true, happiness: 0, moves: [] });
    expect(paste).toContain("Garchomp (F)");
    expect(paste).toContain("Level: 50");
    expect(paste).toContain("Shiny: Yes");
    expect(paste).toContain("Happiness: 0");
  });
});

describe("pokeapiSlug", () => {
  it.each([
    ["Landorus-Therian", "landorus-therian"], ["Mr. Mime", "mr-mime"], ["Flutter Mane", "flutter-mane"],
    ["Farfetch’d", "farfetchd"], ["Type: Null", "type-null"],
  ])("%s → %s", (input, slug) => expect(pokeapiSlug(input)).toBe(slug));
});
