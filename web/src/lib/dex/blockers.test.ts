import { describe, expect, it } from "vitest";
import { saveBlockerItems, saveBlockers } from "./blockers";
import type { ChecklistRow } from "@/lib/api";
import type { BuilderMon } from "./validate";

const mon = (species: string): BuilderMon => ({ species, moves: [], evs: {}, ivs: {} });
const base = { team: [mon("Garchomp")], rows: [] as ChecklistRow[], setErrors: [], learnsetsPending: false, learnsetsError: false };

describe("saveBlockers", () => {
  it("sin motivos cuando todo está en orden", () => {
    expect(saveBlockers(base)).toEqual([]);
  });

  it("equipo vacío", () => {
    expect(saveBlockers({ ...base, team: [] })).toEqual(["El equipo está vacío"]);
  });

  it("learnsets pendientes", () => {
    expect(saveBlockers({ ...base, learnsetsPending: true })).toEqual(["Comprobando movimientos…"]);
  });

  it("learnsets con error", () => {
    expect(saveBlockers({ ...base, learnsetsError: true })).toEqual(["No se pudieron comprobar los movimientos"]);
  });

  it("set con errores, con singular y plural", () => {
    const out = saveBlockers({ ...base, setErrors: [{ name: "Garchomp", count: 2 }, { name: "Dragonite", count: 1 }, { name: "Ok", count: 0 }] });
    expect(out).toEqual(["Garchomp: 2 problemas en el set", "Dragonite: 1 problema en el set"]);
  });

  it("una regla de color que falla bloquea con su etiqueta", () => {
    const rows: ChecklistRow[] = [{ rule: "required_color", label: "Al menos 1 pokémon de color Red", ok: false, names: [] }];
    expect(saveBlockers({ ...base, rows })).toEqual(["Al menos 1 pokémon de color Red"]);
  });

  it("type_of_month no bloquea aunque falle", () => {
    const rows: ChecklistRow[] = [{ rule: "type_of_month", label: "Al menos 1 pokémon de tipo Fire", ok: false, names: [], blocking: false }];
    expect(saveBlockers({ ...base, rows })).toEqual([]);
  });

  it("reglas que cumplen no aparecen", () => {
    const rows: ChecklistRow[] = [{ rule: "item_clause", label: "Sin objetos repetidos", ok: true, names: [] }];
    expect(saveBlockers({ ...base, rows })).toEqual([]);
  });
});

describe("saveBlockerItems", () => {
  it("un set con problemas apunta a su slot (por posición en el equipo)", () => {
    const out = saveBlockerItems({ ...base, setErrors: [{ name: "Ok", count: 0 }, { name: "Garchomp", count: 2 }] });
    expect(out).toEqual([{ message: "Garchomp: 2 problemas en el set", target: { slot: 1 } }]);
  });

  it("una regla incumplida apunta a la regla; los motivos globales no llevan destino", () => {
    const rows: ChecklistRow[] = [{ rule: "required_color", label: "Color Red", ok: false, names: [] }];
    expect(saveBlockerItems({ ...base, rows })).toEqual([{ message: "Color Red", target: { rule: "required_color" } }]);
    expect(saveBlockerItems({ ...base, team: [] })).toEqual([{ message: "El equipo está vacío" }]);
  });
});
