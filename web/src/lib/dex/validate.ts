/**
 * Motor de reglas en el cliente: espejo de bats_core/rules.py (check_team + rule_checklist)
 * para dar respuesta inmediata en el teambuilder. La AUTORIDAD sigue siendo el servidor
 * (POST /api/teams/me/validate); esto es solo para no esperar un roundtrip por cada cambio.
 *
 * Toda regla nueva se implementa PRIMERO en rules.py; aquí es un espejo, no la fuente.
 * `rows` tiene la misma forma que TeamValidation.checklist (lib/api.ts) para poder pintar
 * ambos con el mismo componente.
 */
import type { ChecklistRow, SeasonRestrictions } from "@/lib/api";
import type { DexEssentials, Species } from "./snapshot";
import { isPokemonType } from "@/lib/pokemon-types";
import { speciesById, toId } from "./snapshot";

export interface BuilderMon {
  species: string; // nombre o id de Showdown; se resuelve contra el dex
  held_item?: string | null;
  ability?: string | null;
  nature?: string | null;
  tera_type?: string | null;
  moves: string[];
  evs: Record<string, number>;
  ivs: Record<string, number>;
}

export interface RuleSeason {
  type_of_month?: string | null;
  max_team_size?: number;
  restrictions: SeasonRestrictions;
}

interface Entry {
  name: string;
  held_item: string | null;
  color: string | null;
  generation: number | null;
  egg_groups: string[];
  types: string; // "Ice / Flying", igual que manda el servidor
  is_paradox: boolean;
  is_pseudo: boolean;
  is_restricted: boolean;
  is_ultra_beast: boolean;
  league_legal: boolean;
}

/** Límite de equipo → bandera del dex que cuenta. Igual que DEX_LIMITS en rules.py. */
const DEX_LIMITS: [key: "max_paradox" | "max_pseudo_legendary" | "max_restricted", flag: keyof Entry][] = [
  ["max_paradox", "is_paradox"],
  ["max_pseudo_legendary", "is_pseudo"],
  ["max_restricted", "is_restricted"],
];

const LIMIT_LABELS: Record<string, string> = {
  max_paradox: "Paradox",
  max_pseudo_legendary: "pseudo-legendarios",
  max_restricted: "legendarios restringidos",
};

function normalize(restrictions: SeasonRestrictions) {
  return {
    required_color: (restrictions.required_color ?? null) as string | null,
    required_generation: (restrictions.required_generation ?? null) as number | null,
    required_egg_group: (restrictions.required_egg_group ?? null) as string | null,
    item_clause: restrictions.item_clause ?? false,
    max_paradox: restrictions.max_paradox ?? 1,
    max_pseudo_legendary: restrictions.max_pseudo_legendary ?? 1,
    max_restricted: restrictions.max_restricted ?? 1,
  };
}

/** Resuelve cada BuilderMon contra el dex, tal como bats_core.dex.resolve_entries en el servidor. */
function resolveEntries(dex: DexEssentials, team: BuilderMon[]): { entries: Entry[]; unknown: string[] } {
  const entries: Entry[] = [];
  const unknownSpecies: string[] = [];
  for (const mon of team) {
    const sp = speciesById(dex, mon.species);
    if (!sp) {
      unknownSpecies.push(mon.species);
      continue;
    }
    entries.push({
      name: sp.name,
      held_item: mon.held_item ?? null,
      color: sp.color,
      generation: sp.gen,
      egg_groups: sp.eggGroups,
      types: sp.types.join(" / "),
      is_paradox: sp.paradox,
      is_pseudo: sp.pseudo,
      is_restricted: sp.restricted,
      is_ultra_beast: sp.ultraBeast,
      league_legal: sp.leagueLegal,
    });
  }
  return { entries, unknown: unknownSpecies };
}

function flagged(entries: Entry[], flag: keyof Entry): string[] {
  return entries.filter((e) => e[flag]).map((e) => e.name);
}

interface Violation {
  rule: string;
  code: string;
  names: string[];
}

/**
 * Espejo de check_team(): TODAS las violaciones, lista vacía = válido.
 * `lineup=true` cuenta los límites de Paradox/pseudo/restringidos (solo se aplican al
 * lineup de batalla, hasta 6 pokémon; el pool registrado, hasta 8, no los cuenta).
 */
function checkTeamEntries(
  entries: Entry[],
  restrictions: SeasonRestrictions,
  typeOfMonth?: string | null,
  lineup = false,
): Violation[] {
  const rules = normalize(restrictions);
  const violations: Violation[] = [];

  if (rules.item_clause) {
    const seen = new Map<string, number>();
    for (const e of entries) if (e.held_item) seen.set(e.held_item, (seen.get(e.held_item) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([item]) => item);
    if (dupes.length) violations.push({ rule: "item_clause", code: `item_clause:${dupes.join(",")}`, names: dupes });
  }

  const color = rules.required_color;
  if (color && !entries.some((e) => e.color?.toLowerCase() === color)) {
    violations.push({ rule: "required_color", code: `missing_color:${color}`, names: [] });
  }

  const gen = rules.required_generation;
  if (gen && !entries.some((e) => e.generation === gen)) {
    violations.push({ rule: "required_generation", code: `missing_generation:${gen}`, names: [] });
  }

  const egg = rules.required_egg_group;
  if (egg && !entries.some((e) => e.egg_groups.some((g) => toId(g) === toId(egg)))) {
    violations.push({ rule: "required_egg_group", code: `missing_egg_group:${egg}`, names: [] });
  }

  if (typeOfMonth) {
    const wanted = typeOfMonth.toLowerCase();
    const has = entries.some((e) => e.types.split("/").map((t) => t.trim().toLowerCase()).includes(wanted));
    if (!has) violations.push({ rule: "type_of_month", code: `missing_type:${typeOfMonth}`, names: [] });
  }

  const illegal = entries.filter((e) => !e.league_legal).map((e) => e.name);
  if (illegal.length) violations.push({ rule: "not_legal", code: `not_legal:${illegal.join(",")}`, names: illegal });

  const ubs = flagged(entries, "is_ultra_beast");
  if (ubs.length) violations.push({ rule: "ultra_beast", code: `ultra_beast:${ubs.join(",")}`, names: ubs });

  if (lineup) {
    for (const [key, flag] of DEX_LIMITS) {
      const hits = flagged(entries, flag);
      if (hits.length > rules[key]) {
        violations.push({ rule: key, code: `${key}:${hits.length}/${rules[key]}`, names: hits });
      }
    }
  }

  return violations;
}

export interface CheckTeamResult {
  rows: ChecklistRow[];
  /** Especies del equipo que no existen en el dex (no se pudieron resolver). */
  unknownSpecies: string[];
}

/**
 * Espejo de rule_checklist(): una fila por regla aplicable, cumpla o no. `banned` son
 * nombres de especie ya en minúsculas.
 */
export function checkTeam(
  dex: DexEssentials,
  team: BuilderMon[],
  season: RuleSeason,
  banned: Set<string> = new Set(),
  lineup = false,
): CheckTeamResult {
  const { entries, unknown } = resolveEntries(dex, team);
  const rules = normalize(season.restrictions);
  const violations = checkTeamEntries(entries, season.restrictions, season.type_of_month, lineup);
  const failed = new Map(violations.map((v) => [v.rule, v]));
  const rows: ChecklistRow[] = [];
  const add = (rule: string, label: string, names: string[] = [], blocking?: boolean) => {
    rows.push({
      rule, label, ok: !failed.has(rule), names: failed.get(rule)?.names ?? names,
      ...(blocking === false ? { blocking } : {}),
    });
  };

  if (season.max_team_size != null) {
    const ok = team.length <= season.max_team_size;
    rows.push({
      rule: "team_size",
      label: `Máximo ${season.max_team_size} pokémon (${team.length}/${season.max_team_size})`,
      ok,
      names: [],
    });
  }
  if (banned.size) {
    const hits = entries.filter((e) => banned.has(e.name.toLowerCase())).map((e) => e.name);
    rows.push({ rule: "banned", label: "Sin pokémon baneados", ok: !hits.length, names: hits });
  }
  if (season.type_of_month) add("type_of_month", `Al menos 1 pokémon de tipo ${season.type_of_month}`, [], false);
  if (rules.required_generation) {
    add("required_generation", `Al menos 1 pokémon de la generación ${rules.required_generation}`);
  }
  if (rules.required_egg_group) {
    add("required_egg_group", `Al menos 1 pokémon del Egg Group ${rules.required_egg_group}`);
  }
  if (rules.required_color) add("required_color", `Al menos 1 pokémon de color ${rules.required_color}`);
  if (rules.item_clause) add("item_clause", "Sin objetos repetidos");
  if (entries.some((e) => !e.league_legal)) add("not_legal", "Solo pokémon legales en la liga");
  if (entries.some((e) => e.is_ultra_beast)) add("ultra_beast", "Sin Ultra Beasts");
  if (lineup) {
    for (const [key, flag] of DEX_LIMITS) {
      const hits = flagged(entries, flag);
      rows.push({
        rule: key,
        label: `Máximo ${rules[key]} ${LIMIT_LABELS[key]} (${hits.length}/${rules[key]})`,
        ok: !failed.has(key),
        names: failed.has(key) ? hits : [],
      });
    }
  }

  return { rows, unknownSpecies: unknown };
}

// ── Validación de un set individual ────────────────────────────────────────────

const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS: Record<string, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
const MAX_EVS_TOTAL = 510;
const MAX_EV_PER_STAT = 252;

/**
 * "SpA"/"spa"/"Sp. Atk" -> { spa: n }. Los sets de Showdown (lib/showdown.ts::parseSpread)
 * conservan la mayúscula tal cual la escribió el jugador ("252 SpA"); se normaliza con
 * `toId` igual que bats_core/teamset.py::_spread, para no depender de cómo vino la clave.
 */
function normalizeSpread(raw: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) out[toId(k)] = v;
  return out;
}

function speciesAbilities(sp: Species): Set<string> {
  return new Set(sp.abilities.map(toId));
}

export type SetField = "species" | "item" | "ability" | "nature" | "tera" | "moves" | "evs" | "ivs";

/** Problema de un set con el campo al que pertenece, para pintarlo junto a su control. */
export interface SetProblem {
  field: SetField;
  code: string;
  message: string;
}

/**
 * Problemas de un set individual: movimiento ilegal o repetido, EVs/IVs fuera de rango,
 * habilidad que la especie no tiene, más de 4 movimientos, objeto o Tera inexistente.
 * `learnset` son los ids de movimiento legales de la especie (lib/dex/learnsets.ts);
 * `null` = aún no cargado: se omite solo la comprobación "no aprende", para no dar
 * errores falsos mientras llega.
 */
export function checkSetProblems(dex: DexEssentials, learnset: string[] | null, mon: BuilderMon): SetProblem[] {
  const problems: SetProblem[] = [];
  const add = (field: SetField, code: string, message: string) => problems.push({ field, code, message });
  const sp = speciesById(dex, mon.species);
  if (!sp) return [{ field: "species", code: "unknown_species", message: `"${mon.species}" no existe en el dex.` }];

  const legalMoves = learnset ? new Set(learnset.map(toId)) : null;
  const moveIds = mon.moves.map(toId).filter(Boolean);
  if (legalMoves) {
    for (const [i, id] of moveIds.entries()) {
      const original = mon.moves[i];
      if (!legalMoves.has(id)) add("moves", `illegal_move:${id}`, `${sp.name} no aprende ${original}.`);
    }
  }
  const seen = new Set<string>();
  for (const id of moveIds) {
    if (seen.has(id)) add("moves", `duplicate_move:${id}`, `Movimiento repetido: ${id}.`);
    seen.add(id);
  }
  if (mon.moves.length > 4) add("moves", "too_many_moves", "Un set no puede tener más de 4 movimientos.");

  if (mon.ability && !speciesAbilities(sp).has(toId(mon.ability))) {
    add("ability", `bad_ability:${toId(mon.ability)}`, `${sp.name} no puede tener la habilidad ${mon.ability}.`);
  }

  if (mon.held_item && !dex.items[toId(mon.held_item)]) {
    add("item", `bad_item:${toId(mon.held_item)}`, `"${mon.held_item}" no es un objeto válido.`);
  }

  if (mon.tera_type && !isPokemonType(mon.tera_type.toLowerCase())) {
    add("tera", `bad_tera:${toId(mon.tera_type)}`, `"${mon.tera_type}" no es un tipo Tera válido.`);
  }

  const evs = normalizeSpread(mon.evs);
  const ivs = normalizeSpread(mon.ivs);

  let evTotal = 0;
  for (const stat of STATS) {
    const ev = evs[stat] ?? 0;
    if (ev < 0 || ev > MAX_EV_PER_STAT) {
      add("evs", `ev_range:${stat}`, `Los EVs de ${STAT_LABELS[stat]} deben estar entre 0 y ${MAX_EV_PER_STAT}.`);
    }
    evTotal += Math.max(0, Math.min(ev, MAX_EV_PER_STAT));
  }
  if (evTotal > MAX_EVS_TOTAL) add("evs", "ev_total", `El total de EVs no puede pasar de ${MAX_EVS_TOTAL} (tiene ${evTotal}).`);

  for (const stat of STATS) {
    const iv = ivs[stat];
    if (iv != null && (iv < 0 || iv > 31)) add("ivs", `iv_range:${stat}`, `Los IVs de ${STAT_LABELS[stat]} deben estar entre 0 y 31.`);
  }

  return problems;
}

/** Igual que checkSetProblems, solo los mensajes. */
export function checkSet(dex: DexEssentials, learnset: string[] | null, mon: BuilderMon): string[] {
  return checkSetProblems(dex, learnset, mon).map((p) => p.message);
}
