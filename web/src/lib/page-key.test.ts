import { describe, expect, it } from "vitest";
import { pageKey } from "./page-key";

describe("pageKey", () => {
  it("la ficha de la Pokédex (modal) es la misma página que su grilla", () => {
    expect(pageKey("/pokedex/charizard")).toBe("/pokedex");
    expect(pageKey("/pokedex")).toBe("/pokedex");
    expect(pageKey("/j/ash/pokedex/pikachu")).toBe("/j/ash/pokedex");
    expect(pageKey("/j/ash/pokedex")).toBe("/j/ash/pokedex");
  });

  it("el resto de rutas son su propio pathname", () => {
    expect(pageKey("/stats/pokemon/Garchomp")).toBe("/stats/pokemon/Garchomp");
    expect(pageKey("/j/ash")).toBe("/j/ash");
    expect(pageKey("/pokedex/a/b")).toBe("/pokedex/a/b");
  });
});
