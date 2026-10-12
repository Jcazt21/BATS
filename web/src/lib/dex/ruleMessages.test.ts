import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { describeRuleCode, teamErrorMessage } from "./ruleMessages";

describe("describeRuleCode", () => {
  it.each([
    ["missing_color:red", "Te falta un pokémon de color red."],
    ["missing_generation:4", "Te falta un pokémon de la generación 4."],
    ["missing_egg_group:water1", "Te falta un pokémon del Egg Group water1."],
    ["missing_type:Ice", "Te falta un pokémon de tipo Ice."],
    ["item_clause:Leftovers,Choice Scarf", "Hay objetos repetidos: Leftovers, Choice Scarf."],
    ["not_legal:MissingNo.", "No son legales en la liga: MissingNo.."],
    ["ultra_beast:Buzzwole,Pheromosa", "Las Ultra Beasts no están permitidas: Buzzwole, Pheromosa."],
    ["banned:Garchomp", "Hay pokémon baneados en tu equipo: Garchomp."],
    ["max_paradox:2/1", "Llevas 2 Paradox y el máximo es 1."],
    ["max_pseudo_legendary:2/1", "Llevas 2 pseudo-legendarios y el máximo es 1."],
    ["max_restricted:3/1", "Llevas 3 legendarios restringidos y el máximo es 1."],
  ])("%s → %s", (code, expected) => {
    expect(describeRuleCode(code)).toBe(expected);
  });

  it("devuelve null para textos sin prefijo conocido", () => {
    expect(describeRuleCode("Equipo vacío")).toBeNull();
  });

  it("devuelve null para prefijos desconocidos", () => {
    expect(describeRuleCode("unknown_rule:x")).toBeNull();
  });
});

describe("teamErrorMessage", () => {
  it("traduce un código de regla en un ApiError 422", () => {
    expect(teamErrorMessage(new ApiError(422, "missing_color:red"))).toBe("Te falta un pokémon de color red.");
  });

  it("cae a errorMessage si el detail no es un código conocido", () => {
    expect(teamErrorMessage(new ApiError(422, "El equipo no puede estar vacío."))).toBe(
      "El equipo no puede estar vacío.",
    );
  });

  it.each([
    [409, "unknown_species:Foo,Bar", "No reconocemos estas especies: Foo, Bar."],
    [409, "species_mismatch", "No se puede cambiar la especie al editar un set: usa Reemplazar."],
    [403, "registration_closed", "El registro está cerrado: ya no se pueden hacer cambios."],
    [403, "roster_locked", "Tu equipo está bloqueado: ya no se pueden hacer cambios."],
    [403, "not_in_whitelist", "Tu cuenta no está en esta temporada. Habla con el administrador."],
    [400, "banned:Garchomp", "Hay pokémon baneados en tu equipo: Garchomp."],
  ])("traduce códigos del servidor con status %i: %s", (status, code, expected) => {
    expect(teamErrorMessage(new ApiError(status, code))).toBe(expected);
  });

  it("un status >= 500 no se traduce aunque el detail parezca un código", () => {
    expect(teamErrorMessage(new ApiError(500, "roster_locked"))).not.toBe(
      "Tu equipo está bloqueado: ya no se pueden hacer cambios.",
    );
  });

  it("describeRuleCode soporta códigos sin ':'", () => {
    expect(describeRuleCode("roster_locked")).toBe("Tu equipo está bloqueado: ya no se pueden hacer cambios.");
  });

  it("usa el mensaje de un Error normal", () => {
    expect(teamErrorMessage(new Error("boom"))).toBe("boom");
  });
});
