/**
 * Atajos del buscador de especies: una sugerencia por cada regla de conjunto que el equipo
 * aún no cumple ("Te falta un pokémon de tipo Hielo"), con el filtro que la resuelve.
 */
import type { ChecklistRow } from "@/lib/api";
import type { SpeciesFilters } from "./snapshot";
import type { RuleSeason } from "./validate";

export interface SpeciesHint {
  /** "Te falta un pokémon de tipo Hielo". */
  label: string;
  /** Filtro que aplica el toque sobre el chip. */
  filters: SpeciesFilters;
}

export function buildHints(rows: ChecklistRow[], season: RuleSeason): SpeciesHint[] {
  const failed = (rule: string) => rows.some((r) => r.rule === rule && !r.ok);
  const { required_color: color, required_generation: gen, required_egg_group: egg } = season.restrictions;
  const hints: SpeciesHint[] = [];
  if (failed("type_of_month") && season.type_of_month) {
    hints.push({ label: `Te falta un pokémon de tipo ${season.type_of_month}`, filters: { type: season.type_of_month } });
  }
  if (failed("required_color") && color) {
    hints.push({ label: `Te falta un pokémon de color ${color}`, filters: { color } });
  }
  if (failed("required_generation") && gen) {
    hints.push({ label: `Te falta un pokémon de la generación ${gen}`, filters: { gen } });
  }
  if (failed("required_egg_group") && egg) {
    hints.push({ label: `Te falta un pokémon del Egg Group ${egg}`, filters: { eggGroup: egg } });
  }
  return hints;
}
