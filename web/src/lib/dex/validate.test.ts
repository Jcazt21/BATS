import { describe, expect, it } from "vitest";
import type { Dex, Species } from "./snapshot";
import { checkSet, checkTeam, type BuilderMon, type RuleSeason } from "./validate";

function species(over: Partial<Species> & { id: string; name: string }): Species {
  return {
    num: 1, types: ["Normal"], bst: 300, baseStats: { hp: 60, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 },
    color: "Red", eggGroups: ["Field"], gen: 1, tags: [], abilities: ["Static"], spriteid: over.id,
    baseSpecies: over.name, forme: null, prevo: null, isNonstandard: null, restricted: false, paradox: false,
    ultraBeast: false, pseudo: false, leagueLegal: true, ...over,
  };
}

const SPECIES: Record<string, Species> = {
  a: species({ id: "a", name: "A", color: "Yellow" }),
  b: species({ id: "b", name: "B", gen: 5 }),
  c: species({ id: "c", name: "C", eggGroups: ["Dragon"] }),
  garchomp: species({
    id: "garchomp", name: "Garchomp", types: ["Dragon", "Ground"], bst: 600, pseudo: true,
    abilities: ["Sand Veil", "Rough Skin"],
  }),
  dragonite: species({ id: "dragonite", name: "Dragonite", bst: 600, pseudo: true }),
  greattusk: species({ id: "greattusk", name: "Great Tusk", paradox: true, tags: ["Paradox"] }),
  irontreads: species({ id: "irontreads", name: "Iron Treads", paradox: true, tags: ["Paradox"] }),
  koraidon: species({ id: "koraidon", name: "Koraidon", restricted: true }),
  miraidon: species({ id: "miraidon", name: "Miraidon", restricted: true }),
  buzzwole: species({ id: "buzzwole", name: "Buzzwole", ultraBeast: true }),
  zaciancrowned: species({ id: "zaciancrowned", name: "Zacian-Crowned", leagueLegal: false }),
  fire: species({ id: "fire", name: "Fire", types: ["Fire"] }),
  water: species({ id: "water", name: "Water", types: ["Water", "Ice"] }),
};

const DEX: Dex = {
  meta: { generated_at: "x", ps_commit: "x", counts: { species: 0, moves: 0 }, formats: { league: "x", sparring: "x" } },
  species: SPECIES,
  moves: {
    earthquake: { id: "earthquake", name: "Earthquake", type: "Ground", category: "Physical", basePower: 100, accuracy: 100, pp: 10, priority: 0, shortDesc: "" },
    dragontail: { id: "dragontail", name: "Dragon Tail", type: "Dragon", category: "Physical", basePower: 60, accuracy: 90, pp: 10, priority: -6, shortDesc: "" },
  },
  items: { leftovers: { id: "leftovers", name: "Leftovers", desc: "" }, lifeorb: { id: "lifeorb", name: "Life Orb", desc: "" } },
  natures: {},
};

const mon = (species: string, over: Partial<BuilderMon> = {}): BuilderMon => ({
  species, held_item: null, ability: null, nature: null, tera_type: null, moves: [], evs: {}, ivs: {}, ...over,
});

const season = (over: Partial<RuleSeason> = {}): RuleSeason => ({ restrictions: {}, ...over });

describe("checkTeam", () => {
  it("equipo completo válido: todas las filas en ok", () => {
    const { rows, unknownSpecies } = checkTeam(
      DEX,
      [mon("a"), mon("b"), mon("c", { held_item: "Leftovers" })],
      season({ restrictions: { required_color: "yellow", required_generation: 5, required_egg_group: "dragon", item_clause: true } }),
    );
    expect(unknownSpecies).toEqual([]);
    expect(rows.every((r) => r.ok)).toBe(true);
  });

  it("item clause: marca los objetos repetidos", () => {
    const { rows } = checkTeam(DEX, [mon("a", { held_item: "Leftovers" }), mon("b", { held_item: "Leftovers" })],
      season({ restrictions: { item_clause: true } }));
    const row = rows.find((r) => r.rule === "item_clause")!;
    expect(row.ok).toBe(false);
    expect(row.names).toEqual(["Leftovers"]);
  });

  it("color requerido: falta si ningún pokémon lo tiene", () => {
    const { rows } = checkTeam(DEX, [mon("b")], season({ restrictions: { required_color: "yellow" } }));
    expect(rows.find((r) => r.rule === "required_color")!.ok).toBe(false);
  });

  it("color sin distinguir mayúsculas", () => {
    const { rows } = checkTeam(DEX, [mon("a")], season({ restrictions: { required_color: "yellow" } }));
    expect(rows.find((r) => r.rule === "required_color")!.ok).toBe(true);
  });

  it("generación requerida", () => {
    const { rows } = checkTeam(DEX, [mon("a")], season({ restrictions: { required_generation: 5 } }));
    expect(rows.find((r) => r.rule === "required_generation")!.ok).toBe(false);
    expect(checkTeam(DEX, [mon("b")], season({ restrictions: { required_generation: 5 } }))
      .rows.find((r) => r.rule === "required_generation")!.ok).toBe(true);
  });

  it("egg group requerido", () => {
    const { rows } = checkTeam(DEX, [mon("a")], season({ restrictions: { required_egg_group: "dragon" } }));
    expect(rows.find((r) => r.rule === "required_egg_group")!.ok).toBe(false);
    expect(checkTeam(DEX, [mon("c")], season({ restrictions: { required_egg_group: "dragon" } }))
      .rows.find((r) => r.rule === "required_egg_group")!.ok).toBe(true);
  });

  it("tipo del mes es informativo (blocking: false) y las demás reglas no", () => {
    const { rows } = checkTeam(DEX, [mon("fire")], season({ type_of_month: "Ice", restrictions: { item_clause: true } }));
    expect(rows.find((r) => r.rule === "type_of_month")!.blocking).toBe(false);
    expect(rows.find((r) => r.rule === "item_clause")!.blocking).toBeUndefined();
  });

  it("tipo del mes: solo se exige si se pasa type_of_month", () => {
    expect(checkTeam(DEX, [mon("fire")], season()).rows.some((r) => r.rule === "type_of_month")).toBe(false);
    const { rows } = checkTeam(DEX, [mon("fire")], season({ type_of_month: "Ice" }));
    expect(rows.find((r) => r.rule === "type_of_month")!.ok).toBe(false);
    expect(checkTeam(DEX, [mon("water")], season({ type_of_month: "Ice" }))
      .rows.find((r) => r.rule === "type_of_month")!.ok).toBe(true);
  });

  it("prohíbe Ultra Beasts y especies no legales", () => {
    const ub = checkTeam(DEX, [mon("buzzwole")], season());
    expect(ub.rows.find((r) => r.rule === "ultra_beast")!.ok).toBe(false);
    const illegal = checkTeam(DEX, [mon("zaciancrowned")], season());
    expect(illegal.rows.find((r) => r.rule === "not_legal")!.ok).toBe(false);
  });

  it("límites de Paradox/pseudo/restringidos solo cuentan en el lineup", () => {
    const team = [mon("greattusk"), mon("irontreads")];
    const pool = checkTeam(DEX, team, season({ restrictions: { max_paradox: 1 } }));
    expect(pool.rows.some((r) => r.rule === "max_paradox")).toBe(false); // pool: no se evalúa
    const lineup = checkTeam(DEX, team, season({ restrictions: { max_paradox: 1 } }), new Set(), true);
    const row = lineup.rows.find((r) => r.rule === "max_paradox")!;
    expect(row.ok).toBe(false);
    expect(row.names).toEqual(["Great Tusk", "Iron Treads"]);
  });

  it("máximo de pseudo-legendarios y de restringidos", () => {
    const pseudo = checkTeam(DEX, [mon("garchomp"), mon("dragonite")],
      season({ restrictions: { max_pseudo_legendary: 1 } }), new Set(), true);
    expect(pseudo.rows.find((r) => r.rule === "max_pseudo_legendary")!.ok).toBe(false);

    const restricted = checkTeam(DEX, [mon("koraidon"), mon("miraidon")], season(), new Set(), true);
    expect(restricted.rows.find((r) => r.rule === "max_restricted")!.ok).toBe(false);
  });

  it("tamaño de equipo", () => {
    const { rows } = checkTeam(DEX, [mon("a"), mon("b"), mon("c")], season({ max_team_size: 2 }));
    expect(rows.find((r) => r.rule === "team_size")!.ok).toBe(false);
  });

  it("pokémon baneados", () => {
    const { rows } = checkTeam(DEX, [mon("a")], season(), new Set(["a"]));
    const row = rows.find((r) => r.rule === "banned")!;
    expect(row.ok).toBe(false);
    expect(row.names).toEqual(["A"]);
  });

  it("especie desconocida no rompe el checklist y se reporta aparte", () => {
    const { unknownSpecies, rows } = checkTeam(DEX, [mon("noexiste"), mon("a")], season());
    expect(unknownSpecies).toEqual(["noexiste"]);
    expect(rows).toBeDefined();
  });
});

describe("checkSet", () => {
  const learnset = ["earthquake", "dragontail"];

  it("set legal: sin errores", () => {
    const errors = checkSet(DEX, learnset, mon("garchomp", {
      ability: "Rough Skin", held_item: "Leftovers", moves: ["Earthquake", "Dragon Tail"],
      evs: { hp: 252, spd: 252 }, ivs: { atk: 31 },
    }));
    expect(errors).toEqual([]);
  });

  it("movimiento fuera del learnset", () => {
    expect(checkSet(DEX, learnset, mon("garchomp", { moves: ["Psychic"] })).length).toBeGreaterThan(0);
  });

  it("learnset aún no cargado (null): no dice que no aprende, pero sigue validando lo demás", () => {
    expect(checkSet(DEX, null, mon("garchomp", { moves: ["Psychic"] }))).toEqual([]);
    const errors = checkSet(DEX, null, mon("garchomp", { moves: ["Psychic", "Psychic"], ability: "Levitate" }));
    expect(errors.some((e) => /no aprende/.test(e))).toBe(false);
    expect(errors.some((e) => /repetido/i.test(e))).toBe(true);
    expect(errors.some((e) => /habilidad/.test(e))).toBe(true);
  });

  it("movimiento repetido", () => {
    expect(checkSet(DEX, learnset, mon("garchomp", { moves: ["Earthquake", "Earthquake"] })).length).toBeGreaterThan(0);
  });

  it("más de 4 movimientos", () => {
    expect(checkSet(DEX, [...learnset, "a", "b"], mon("garchomp", { moves: ["Earthquake", "Dragon Tail", "a", "b", "Earthquake"] }))).toEqual(
      expect.arrayContaining([expect.stringContaining("4 movimientos")]),
    );
  });

  it("habilidad que la especie no tiene", () => {
    expect(checkSet(DEX, learnset, mon("garchomp", { ability: "Levitate" })).length).toBeGreaterThan(0);
  });

  it("objeto inexistente", () => {
    expect(checkSet(DEX, learnset, mon("garchomp", { held_item: "Objeto Falso" })).length).toBeGreaterThan(0);
  });

  it("EVs por encima de 252 en una stat o 510 en total", () => {
    expect(checkSet(DEX, learnset, mon("garchomp", { evs: { hp: 300 } })).length).toBeGreaterThan(0);
    expect(checkSet(DEX, learnset, mon("garchomp", { evs: { hp: 252, atk: 252, def: 252 } })).length).toBeGreaterThan(0);
  });

  it("lee EVs/IVs con las mayúsculas de un paste de Showdown (SpA, no spa)", () => {
    // parseSpread (lib/showdown.ts) conserva la mayúscula tal cual la escribió el jugador.
    expect(checkSet(DEX, learnset, mon("garchomp", { evs: { SpA: 252, Atk: 4, SpD: 252 } }))).toEqual([]);
    expect(checkSet(DEX, learnset, mon("garchomp", { evs: { SpA: 300 } })).length).toBeGreaterThan(0);
    expect(checkSet(DEX, learnset, mon("garchomp", { ivs: { Spe: 32 } })).length).toBeGreaterThan(0);
  });

  it("IVs fuera de 0-31", () => {
    expect(checkSet(DEX, learnset, mon("garchomp", { ivs: { spe: 32 } })).length).toBeGreaterThan(0);
  });

  it("especie inexistente", () => {
    expect(checkSet(DEX, learnset, mon("noexiste")).length).toBeGreaterThan(0);
  });
});
