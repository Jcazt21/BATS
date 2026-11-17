import { describe, expect, it } from "vitest";
import type { PlayerPokedexStats } from "@/lib/api";
import type { DexEssentials, Species } from "./snapshot";
import { aggregateCellPlayerStats } from "./player-stats";

function sp(id: string, name: string, num: number, extra: Partial<Species> = {}): Species {
  return {
    id,
    name,
    num,
    types: ["Fire"],
    bst: 500,
    baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
    color: "Red",
    eggGroups: [],
    gen: 1,
    tags: [],
    abilities: ["Blaze"],
    spriteid: id,
    baseSpecies: name,
    forme: null,
    prevo: null,
    isNonstandard: null,
    restricted: false,
    paradox: false,
    ultraBeast: false,
    pseudo: false,
    leagueLegal: true,
    ...extra,
  };
}

const DEX: DexEssentials = {
  species: {
    charizard: sp("charizard", "Charizard", 6, { types: ["Fire", "Flying"] }),
    charizardmegax: sp("charizardmegax", "Charizard-Mega-X", 6, {
      types: ["Fire", "Dragon"],
      baseSpecies: "Charizard",
      forme: "Mega-X",
    }),
    charizardmegay: sp("charizardmegay", "Charizard-Mega-Y", 6, {
      types: ["Fire", "Flying"],
      baseSpecies: "Charizard",
      forme: "Mega-Y",
    }),
    garchomp: sp("garchomp", "Garchomp", 445, { types: ["Dragon", "Ground"], gen: 4 }),
    heatran: sp("heatran", "Heatran", 485, { types: ["Fire", "Steel"], gen: 4 }),
    charmander: sp("charmander", "Charmander", 4),
  },
  items: {},
  meta: {
    generated_at: "2026-11-17T00:00:00Z",
    ps_commit: "test",
    counts: { species: 6, moves: 0 },
    formats: { league: "gen9pinchesgueysleague", sparring: "gen9ou" },
  },
};

describe("aggregateCellPlayerStats", () => {
  it("suma todas las formas del mismo número y elige la mejor batalla por MVP", () => {
    const stats: PlayerPokedexStats = {
      username: "jazar",
      species: [
        {
          species: "Charizard",
          used: {
            battles: 3,
            kills: 5,
            mvp: 9.5,
            best: { battle_id: "b-1", kills: 2, mvp: 4.5, opponent: "bea", date: "2026-11-01" },
          },
          faced: null,
        },
        {
          species: "Charizard-Mega-Y",
          used: {
            battles: 4,
            kills: 7,
            mvp: 11.75,
            best: { battle_id: "b-2", kills: 3, mvp: 7.25, opponent: "kael", date: "2026-11-08" },
          },
          faced: null,
        },
        {
          species: "Garchomp",
          used: {
            battles: 9,
            kills: 15,
            mvp: 25,
            best: { battle_id: "b-3", kills: 5, mvp: 10, opponent: "tono", date: "2026-11-10" },
          },
          faced: null,
        },
      ],
    };

    expect(aggregateCellPlayerStats(DEX, 6, stats, "seen")).toEqual({
      kind: "used",
      battles: 7,
      kills: 12,
      mvp: 21.25,
      best: { battle_id: "b-2", kills: 3, mvp: 7.25, opponent: "kael", date: "2026-11-08" },
    });
  });

  it("si fue usado y enfrentado a la vez (en la misma forma o en otra), gana usado", () => {
    const stats: PlayerPokedexStats = {
      username: "jazar",
      species: [
        {
          species: "Charizard",
          used: null,
          faced: { battles: 3, kills_against: 4, wins: 2 },
        },
        {
          species: "Charizard-Mega-X",
          used: {
            battles: 2,
            kills: 4,
            mvp: 6.5,
            best: { battle_id: "b-4", kills: 3, mvp: 5.5, opponent: "ronny", date: "2026-11-09" },
          },
          faced: { battles: 1, kills_against: 1, wins: 1 },
        },
      ],
    };

    expect(aggregateCellPlayerStats(DEX, 6, stats, "seen")).toEqual({
      kind: "used",
      battles: 2,
      kills: 4,
      mvp: 6.5,
      best: { battle_id: "b-4", kills: 3, mvp: 5.5, opponent: "ronny", date: "2026-11-09" },
    });
  });

  it("caso solo enfrentado: suma battles, kills_against y wins entre formas", () => {
    const stats: PlayerPokedexStats = {
      username: "jazar",
      species: [
        {
          species: "Charizard",
          used: null,
          faced: { battles: 2, kills_against: 1, wins: 2 },
        },
        {
          species: "Charizard-Mega-Y",
          used: null,
          faced: { battles: 2, kills_against: 2, wins: 1 },
        },
      ],
    };

    expect(aggregateCellPlayerStats(DEX, 6, stats, "seen")).toEqual({
      kind: "faced",
      battles: 4,
      killsAgainst: 3,
      wins: 3,
    });
  });

  it("devuelve empty si es por evolución, si battle.* está vacío o si no hay stats", () => {
    const emptyStats: PlayerPokedexStats = { username: "jazar", species: [] };
    const zeroStats: PlayerPokedexStats = {
      username: "jazar",
      species: [{ species: "Heatran", used: null, faced: { battles: 0, kills_against: 0, wins: 0 } }],
    };

    expect(aggregateCellPlayerStats(DEX, 4, emptyStats, "evolution")).toEqual({ kind: "empty" });
    expect(aggregateCellPlayerStats(DEX, 485, undefined, "seen")).toEqual({ kind: "empty" });
    expect(aggregateCellPlayerStats(DEX, 485, emptyStats, "seen")).toEqual({ kind: "empty" });
    expect(aggregateCellPlayerStats(DEX, 485, zeroStats, "seen")).toEqual({ kind: "empty" });
  });

  it("ignora especies desconocidas en el dex sin fallar y resuelve por id o nombre", () => {
    const stats: PlayerPokedexStats = {
      username: "jazar",
      species: [
        {
          species: "missingno",
          used: {
            battles: 1,
            kills: 1,
            mvp: 2,
            best: { battle_id: "b-x", kills: 1, mvp: 2, opponent: "x", date: "2026-11-01" },
          },
          faced: null,
        },
        {
          species: "garchomp",
          used: null,
          faced: { battles: 3, kills_against: 4, wins: 2 },
        },
      ],
    };

    expect(aggregateCellPlayerStats(DEX, 445, stats, "seen")).toEqual({
      kind: "faced",
      battles: 3,
      killsAgainst: 4,
      wins: 2,
    });
  });
});
