import { describe, expect, it } from "vitest";
import { leagueSetCard } from "./league-set";
import type { PokedexEntry } from "@/lib/api";
import type { Species } from "./snapshot";

const species = { name: "Charizard", types: ["Fire", "Flying"], abilities: ["Blaze", "Solar Power"] } as Species;
const c = (name: string, count: number) => ({ name, count });
const entry = (sets: Partial<PokedexEntry["sets"]>) => ({
  sets: { players: 3, moves: [], items: [], abilities: [], natures: [], tera_types: [], ...sets },
}) as unknown as PokedexEntry;

describe("leagueSetCard", () => {
  it("usa el objeto, la habilidad y los 4 movimientos más usados de la liga", () => {
    const card = leagueSetCard(species, entry({
      items: [c("Heavy-Duty Boots", 3), c("Choice Specs", 1)],
      abilities: [c("Solar Power", 2)],
      moves: [c("Flamethrower", 3), c("Air Slash", 3), c("Roost", 2), c("Focus Blast", 2), c("Will-O-Wisp", 1)],
    }));
    expect(card).toEqual({
      name: "Charizard", types: "Fire / Flying", held_item: "Heavy-Duty Boots", ability: "Solar Power",
      moves: ["Flamethrower", "Air Slash", "Roost", "Focus Blast"],
    });
  });

  it("sin datos de la liga queda limpia: solo especie y su habilidad principal", () => {
    const vacia = { name: "Charizard", types: "Fire / Flying", held_item: null, ability: "Blaze", moves: [] };
    expect(leagueSetCard(species)).toEqual(vacia);
    expect(leagueSetCard(species, entry({}))).toEqual(vacia);
  });
});
