import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDexForTests, loadDexDetails, loadDexEssentials, searchSpecies, speciesById, toId } from "./snapshot";
import { __resetLearnsetsForTests, loadLearnset } from "./learnsets";

const META = {
  generated_at: "2026-09-21T00:00:00.000Z",
  ps_commit: "abc1234",
  counts: { species: 2, moves: 1 },
  formats: { league: "gen9pinchesgueysleague", sparring: "gen9pglsparring" },
};

const SPECIES = {
  garchomp: {
    id: "garchomp", name: "Garchomp", num: 445, types: ["Dragon", "Ground"], bst: 600,
    baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 }, color: "Blue",
    eggGroups: ["Monster", "Dragon"], gen: 4, tags: [], abilities: ["Sand Veil", "Rough Skin"],
    spriteid: "garchomp", baseSpecies: "Garchomp", forme: null, prevo: "Gabite", isNonstandard: null,
    restricted: false, paradox: false, ultraBeast: false, pseudo: true, leagueLegal: true,
  },
  urshifurapidstrike: {
    id: "urshifurapidstrike", name: "Urshifu-Rapid-Strike", num: 892, types: ["Fighting", "Water"],
    bst: 550, baseStats: { hp: 100, atk: 130, def: 100, spa: 63, spd: 60, spe: 97 }, color: "Gray",
    eggGroups: ["Undiscovered"], gen: 8, tags: ["Sub-Legendary"], abilities: ["Unseen Fist"],
    spriteid: "urshifu-rapidstrike", baseSpecies: "Urshifu", forme: "Rapid-Strike", prevo: "Kubfu",
    isNonstandard: null, restricted: true, paradox: false, ultraBeast: false, pseudo: false,
    leagueLegal: true,
  },
};

const MOVES = {
  earthquake: {
    id: "earthquake", name: "Earthquake", type: "Ground", category: "Physical", basePower: 100,
    accuracy: 100, pp: 10, priority: 0, shortDesc: "Hits adjacent Pokemon.",
  },
};

const FILES: Record<string, unknown> = {
  "/dex/meta.json": META,
  [`/dex/species.json?v=${encodeURIComponent(META.generated_at)}`]: SPECIES,
  [`/dex/moves.json?v=${encodeURIComponent(META.generated_at)}`]: MOVES,
  [`/dex/items.json?v=${encodeURIComponent(META.generated_at)}`]: {},
  [`/dex/natures.json?v=${encodeURIComponent(META.generated_at)}`]: { impish: { name: "Impish", plus: "def", minus: "spa" } },
  "/dex/learnsets/g.json": { garchomp: ["earthquake", "dragontail"] },
  "/dex/learnsets/u.json": { urshifurapidstrike: ["closecombat", "surgingstrikes"] },
};

function installFetchMock() {
  let calls = 0;
  const seen: string[] = [];
  const fetchMock = vi.fn((url: string) => {
    calls++;
    seen.push(url);
    if (!(url in FILES)) return Promise.resolve({ ok: false, status: 404 } as Response);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(FILES[url]) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls: () => calls, seen };
}

describe("loadDexEssentials", () => {
  beforeEach(() => {
    __resetDexForTests();
    __resetLearnsetsForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("carga meta, species e items", async () => {
    installFetchMock();
    const dex = await loadDexEssentials();
    expect(dex.meta.ps_commit).toBe("abc1234");
    expect(dex.species.garchomp.name).toBe("Garchomp");
    expect(dex.items).toEqual({});
  });

  it("un solo fetch por archivo aunque loadDexEssentials() se llame dos veces", async () => {
    const { fetchMock } = installFetchMock();
    await loadDexEssentials();
    await loadDexEssentials();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("especie inexistente por nombre o id devuelve null", async () => {
    installFetchMock();
    const dex = await loadDexEssentials();
    expect(speciesById(dex, "Missingno")).toBeNull();
  });

  it("resuelve por nombre, id y forma", async () => {
    installFetchMock();
    const dex = await loadDexEssentials();
    expect(speciesById(dex, "garchomp")?.name).toBe("Garchomp");
    expect(speciesById(dex, "Garchomp")?.id).toBe("garchomp");
    expect(speciesById(dex, "Urshifu-Rapid-Strike")?.baseSpecies).toBe("Urshifu");
  });
});

describe("loadDexDetails", () => {
  beforeEach(() => __resetDexForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("carga movimientos y naturalezas solo al pedir detalles", async () => {
    const { seen } = installFetchMock();
    await loadDexEssentials();
    expect(seen.some((url) => url.includes("moves.json") || url.includes("natures.json") || url.includes("abilities.json"))).toBe(false);
    const details = await loadDexDetails();
    expect(details.moves.earthquake.basePower).toBe(100);
    expect(details.natures.impish.plus).toBe("def");
    expect(seen.filter((url) => url === "/dex/meta.json")).toHaveLength(1);
  });
});

describe("searchSpecies", () => {
  it("busca por nombre y combina filtros", async () => {
    installFetchMock();
    const dex = await loadDexEssentials();
    expect(searchSpecies(dex, "gar").map((s) => s.id)).toEqual(["garchomp"]);
    expect(searchSpecies(dex, "", { type: "Water" }).map((s) => s.id)).toEqual(["urshifurapidstrike"]);
    expect(searchSpecies(dex, "", { type: "Water", gen: 4 })).toEqual([]);
    expect(searchSpecies(dex, "", { onlyLegal: true }).length).toBe(2);
  });
  it("ordena por nombre, número, BST o velocidad", async () => {
    installFetchMock();
    const base = await loadDexEssentials();
    const abra = {
      ...SPECIES.garchomp, id: "abra", name: "Abra", num: 63, bst: 310,
      baseStats: { hp: 25, atk: 20, def: 15, spa: 105, spd: 55, spe: 120 },
    };
    const dex = { ...base, species: { ...base.species, abra } };
    const ids = (sort: Parameters<typeof searchSpecies>[3]) => searchSpecies(dex, "", {}, sort).map((s) => s.id);
    expect(ids("name")).toEqual(["abra", "garchomp", "urshifurapidstrike"]);
    expect(ids("num")).toEqual(["abra", "garchomp", "urshifurapidstrike"]);
    expect(ids("bst")).toEqual(["garchomp", "urshifurapidstrike", "abra"]);
    expect(ids("spe")).toEqual(["abra", "garchomp", "urshifurapidstrike"]);
  });

  it("acepta los valores de la temporada aunque el dex los escriba distinto", async () => {
    installFetchMock();
    const base = await loadDexEssentials();
    const psyduck = { ...SPECIES.garchomp, id: "psyduck", name: "Psyduck", color: "Yellow", eggGroups: ["Water 1", "Field"], types: ["Water"] };
    const dex = { ...base, species: { ...base.species, psyduck } };
    expect(searchSpecies(dex, "", { eggGroup: "water1" }).map((s) => s.id)).toEqual(["psyduck"]);
    expect(searchSpecies(dex, "", { color: "yellow", type: "water" }).map((s) => s.id)).toEqual(["psyduck"]);
  });
});

describe("toId", () => {
  it.each([
    ["Mr. Mime", "mrmime"], ["Urshifu-Rapid-Strike", "urshifurapidstrike"], [undefined, ""],
  ])("%s -> %s", (input, expected) => expect(toId(input as string)).toBe(expected));
});

describe("loadLearnset", () => {
  beforeEach(() => __resetLearnsetsForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("carga el bucket de la especie y cachea por bucket", async () => {
    const { fetchMock } = installFetchMock();
    expect(await loadLearnset("Garchomp")).toEqual(["earthquake", "dragontail"]);
    await loadLearnset("garchomp");
    expect(fetchMock).toHaveBeenCalledTimes(1); // mismo bucket, un solo fetch
    expect(await loadLearnset("Urshifu-Rapid-Strike")).toEqual(["closecombat", "surgingstrikes"]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // bucket distinto
  });

  it("especie sin entrada en su bucket devuelve []", async () => {
    installFetchMock();
    expect(await loadLearnset("Gabite")).toEqual([]); // bucket "g" existe, pero sin "gabite"
  });
});
