/**
 * Estado de cada regla de la temporada para la barra de reglas: pass / fail / info más la
 * acción sugerida (filtro del buscador) cuando falta algo que un pokémon nuevo resuelve.
 * El tipo del mes es `fail` (no `info`) si nadie lo cumple, aunque el servidor no lo exija
 * al registrar: `note` lo aclara.
 */
import type { ChecklistRow } from "@/lib/api";
import type { SpeciesFilters } from "./snapshot";
import type { RuleSeason } from "./validate";

export interface RuleStatus {
  rule: string;
  state: "pass" | "fail" | "info";
  label: string;
  /** Etiqueta corta para chips ("Tipo Ice", "Gen 5"). */
  short: string;
  /** Aclaración corta bajo el estado ("Se exige al batallar"). */
  note?: string;
  action?: { label: string; filters: SpeciesFilters };
}

export function ruleStatus(row: ChecklistRow, season: RuleSeason): RuleStatus {
  const { required_color: color, required_generation: gen, required_egg_group: egg } = season.restrictions;
  const state: RuleStatus["state"] = row.ok ? "pass" : "fail";
  const short =
    row.rule === "type_of_month" && season.type_of_month ? `Tipo ${season.type_of_month}`
    : row.rule === "required_generation" && gen ? `Gen ${gen}`
    : row.rule === "required_color" && color ? `Color ${color}`
    : row.rule === "required_egg_group" && egg ? `Egg Group ${egg}`
    : row.label;
  const base: RuleStatus = { rule: row.rule, state, label: row.label, short };
  if (row.ok) return base;
  switch (row.rule) {
    case "type_of_month":
      return {
        ...base,
        note: "Se exige al batallar",
        ...(season.type_of_month && {
          action: { label: `Buscar tipo ${season.type_of_month}`, filters: { type: season.type_of_month } },
        }),
      };
    case "required_generation":
      return gen ? { ...base, action: { label: `Buscar Gen ${gen}`, filters: { gen } } } : base;
    case "required_color":
      return color ? { ...base, action: { label: `Buscar color ${color}`, filters: { color } } } : base;
    case "required_egg_group":
      return egg ? { ...base, action: { label: `Buscar Egg Group ${egg}`, filters: { eggGroup: egg } } } : base;
    default:
      return base;
  }
}
