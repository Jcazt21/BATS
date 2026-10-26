import { describe, expect, it } from "vitest";
import { slotStatus } from "./slotStatus";
import type { BuilderMon, SetProblem } from "./validate";

const full: BuilderMon = {
  species: "garchomp", held_item: "Leftovers", ability: "Rough Skin",
  moves: ["a", "b", "c", "d"], evs: {}, ivs: {},
};
const problem: SetProblem = { field: "moves", code: "x", message: "x" };

describe("slotStatus", () => {
  it("sin pokémon: empty", () => {
    expect(slotStatus(null, [], false)).toBe("empty");
    expect(slotStatus(undefined, [], false)).toBe("empty");
  });
  it("set completo y sin problemas: ready", () => {
    expect(slotStatus(full, [], false)).toBe("ready");
  });
  it("faltan movimientos, objeto o habilidad: incomplete", () => {
    expect(slotStatus({ ...full, moves: ["a"] }, [], false)).toBe("incomplete");
    expect(slotStatus({ ...full, held_item: null }, [], false)).toBe("incomplete");
    expect(slotStatus({ ...full, ability: null }, [], false)).toBe("incomplete");
  });
  it("con problemas: error, aunque esté incompleto", () => {
    expect(slotStatus(full, [problem], false)).toBe("error");
    expect(slotStatus({ ...full, moves: [] }, [problem], false)).toBe("error");
  });
  it("learnset pendiente: incomplete", () => {
    expect(slotStatus(full, [], true)).toBe("incomplete");
  });
});
