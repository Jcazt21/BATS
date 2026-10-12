import { describe, expect, it } from "vitest";
import { buildHints } from "./hints";
import type { ChecklistRow } from "@/lib/api";

const row = (rule: string, ok: boolean): ChecklistRow => ({ rule, label: rule, ok, names: [] });

describe("buildHints", () => {
  it("devuelve un atajo por cada regla de conjunto que falta", () => {
    const hints = buildHints(
      [row("type_of_month", false), row("required_color", false), row("required_generation", true), row("item_clause", false)],
      { type_of_month: "Ice", restrictions: { required_color: "red", required_generation: 4 } },
    );
    expect(hints.map((h) => h.filters)).toEqual([{ type: "Ice" }, { color: "red" }]);
    expect(hints[0].label).toMatch(/tipo Ice/);
  });

  it("sin reglas que falten no hay atajos", () => {
    expect(buildHints([row("type_of_month", true)], { type_of_month: "Ice", restrictions: {} })).toEqual([]);
  });
});
