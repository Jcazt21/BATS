/** Cobertura defensiva estándar desde la sexta generación. */
import { parseTypes, POKEMON_TYPES, typeLabel, type PokemonType } from "@/lib/pokemon-types";
import { speciesById, type DexEssentials, type Species } from "./snapshot";
import type { BuilderMon } from "./validate";

const SUPER_EFFECTIVE: Record<PokemonType, PokemonType[]> = {
  normal: [], fire: ["grass", "ice", "bug", "steel"], water: ["fire", "ground", "rock"],
  electric: ["water", "flying"], grass: ["water", "ground", "rock"], ice: ["grass", "ground", "flying", "dragon"],
  fighting: ["normal", "ice", "rock", "dark", "steel"], poison: ["grass", "fairy"],
  ground: ["fire", "electric", "poison", "rock", "steel"], flying: ["grass", "fighting", "bug"],
  psychic: ["fighting", "poison"], bug: ["grass", "psychic", "dark"], rock: ["fire", "ice", "flying", "bug"],
  ghost: ["psychic", "ghost"], dragon: ["dragon"], dark: ["psychic", "ghost"], steel: ["ice", "rock", "fairy"],
  fairy: ["fighting", "dragon", "dark"],
};

const NOT_VERY_EFFECTIVE: Record<PokemonType, PokemonType[]> = {
  normal: ["rock", "steel"], fire: ["fire", "water", "rock", "dragon"], water: ["water", "grass", "dragon"],
  electric: ["electric", "grass", "dragon"], grass: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"],
  ice: ["fire", "water", "ice", "steel"], fighting: ["poison", "flying", "psychic", "bug", "fairy"],
  poison: ["poison", "ground", "rock", "ghost"], ground: ["grass", "bug"], flying: ["electric", "rock", "steel"],
  psychic: ["psychic", "steel"], bug: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"],
  rock: ["fighting", "ground", "steel"], ghost: ["dark"], dragon: ["steel"], dark: ["fighting", "dark", "fairy"],
  steel: ["fire", "water", "electric", "steel"], fairy: ["fire", "poison", "steel"],
};

const NO_EFFECT: Record<PokemonType, PokemonType[]> = {
  normal: ["ghost"], fire: [], water: [], electric: ["ground"], grass: [], ice: [],
  fighting: ["ghost"], poison: ["steel"], ground: ["flying"], flying: [], psychic: ["dark"], bug: [],
  rock: [], ghost: ["normal"], dragon: ["fairy"], dark: [], steel: [], fairy: [],
};

function multiplierAgainstType(attack: PokemonType, defend: PokemonType): number {
  if (NO_EFFECT[attack].includes(defend)) return 0;
  if (SUPER_EFFECTIVE[attack].includes(defend)) return 2;
  if (NOT_VERY_EFFECTIVE[attack].includes(defend)) return 0.5;
  return 1;
}

/** Multiplica la efectividad del ataque contra los tipos defensivos. */
export function multiplierAgainst(attack: PokemonType, defendTypes: PokemonType[]): number {
  return defendTypes.reduce((multiplier, type) => multiplier * multiplierAgainstType(attack, type), 1);
}

export interface CoverageRow {
  type: PokemonType;
  weak: string[];
  resist: string[];
  immune: string[];
  sharedWeakness: boolean;
}

/** Calcula qué especies del equipo son débiles, resistentes o inmunes a cada tipo de ataque. */
export function computeTypeCoverage(dex: DexEssentials, team: BuilderMon[]): CoverageRow[] {
  const species = team.map((mon) => speciesById(dex, mon.species)).filter((sp): sp is Species => sp !== null);
  return POKEMON_TYPES.map((type) => {
    const weak: string[] = [];
    const resist: string[] = [];
    const immune: string[] = [];
    for (const sp of species) {
      const multiplier = multiplierAgainst(type, parseTypes(sp.types.join(" / ")));
      if (multiplier === 0) immune.push(sp.name);
      else if (multiplier >= 2) weak.push(sp.name);
      else if (multiplier < 1) resist.push(sp.name);
    }
    return { type, weak, resist, immune, sharedWeakness: weak.length >= 2 };
  });
}

/** Un tipo sin respuesta: golpea a 2+ integrantes y nadie lo resiste ni es inmune. */
export const unanswered = (row: CoverageRow) => row.weak.length >= 2 && row.resist.length + row.immune.length === 0;

/** Resumen de una línea ("2 débiles a Tierra") para la barra móvil; null si no hay nada que señalar. */
export function coverageSummary(rows: CoverageRow[]): string | null {
  const worst = rows.filter((r) => r.sharedWeakness).sort((a, b) => b.weak.length - a.weak.length)[0];
  return worst ? `${worst.weak.length} débiles a ${typeLabel(worst.type)}` : null;
}
