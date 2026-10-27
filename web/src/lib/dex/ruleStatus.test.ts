import { describe, expect, it } from "vitest";
import type { ChecklistRow } from "@/lib/api";
import { ruleStatus } from "./ruleStatus";
import type { RuleSeason } from "./validate";

const season: RuleSeason = {
  type_of_month: "Ice",
  restrictions: { required_color: "yellow", required_generation: 5, required_egg_group: "dragon" },
};
const row = (rule: string, ok: boolean, extra: Partial<ChecklistRow> = {}): ChecklistRow => ({
  rule, label: `label ${rule}`, ok, names: [], ...extra,
});

describe("ruleStatus", () => {
  it("regla cumplida: pass sin acción", () => {
    expect(ruleStatus(row("required_generation", true), season)).toEqual({
      rule: "required_generation", state: "pass", label: "label required_generation", short: "Gen 5",
    });
  });
  it("tipo del mes sin cumplir es fail (no info) con acción y nota", () => {
    const s = ruleStatus(row("type_of_month", false, { blocking: false }), season);
    expect(s.state).toBe("fail");
    expect(s.note).toBe("Se exige al batallar");
    expect(s.action).toEqual({ label: "Buscar tipo Ice", filters: { type: "Ice" } });
  });
  it.each([
    ["required_generation", "Buscar Gen 5", { gen: 5 }],
    ["required_color", "Buscar color yellow", { color: "yellow" }],
    ["required_egg_group", "Buscar Egg Group dragon", { eggGroup: "dragon" }],
  ])("%s fallida sugiere %s", (rule, label, filters) => {
    expect(ruleStatus(row(rule, false), season).action).toEqual({ label, filters });
  });
  it("etiqueta corta para chips; las demás reglas conservan su texto", () => {
    expect(ruleStatus(row("type_of_month", true), season).short).toBe("Tipo Ice");
    expect(ruleStatus(row("required_egg_group", true), season).short).toBe("Egg Group dragon");
    expect(ruleStatus(row("item_clause", true), season).short).toBe("label item_clause");
  });
  it("reglas sin acción posible (item clause, baneados) fallan sin acción", () => {
    expect(ruleStatus(row("item_clause", false), season).action).toBeUndefined();
    expect(ruleStatus(row("banned", false), season).state).toBe("fail");
  });
});
