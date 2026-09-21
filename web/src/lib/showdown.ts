/**
 * Formato de paste de Pokémon Showdown: lectura y escritura.
 * Puro y sin red: se puede probar (showdown.test.ts).
 */
export interface ShowdownPokemon {
  species: string;
  nickname?: string;
  held_item?: string;
  ability?: string;
  nature?: string;
  tera_type?: string;
  moves: string[];
  evs: Record<string, number>;
  ivs: Record<string, number>;
}

function parseSpread(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of text.split("/")) {
    const [val, stat] = part.trim().split(/\s+/);
    const n = parseInt(val, 10);
    if (stat && !Number.isNaN(n)) out[stat] = n;
  }
  return out;
}

export function parseBlock(block: string): ShowdownPokemon | null {
  const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  // "Apodo (Especie) (M) @ Objeto" | "Especie @ Objeto" | "Especie"
  const [rawName, rawItem] = lines[0].split(" @ ");
  const namePart = rawName.replace(/\s*\((?:M|F)\)\s*$/i, "").trim();
  const nick = namePart.match(/^(.+?)\s*\((.+?)\)$/);
  const species = (nick ? nick[2] : namePart).trim();
  if (!species) return null;

  const mon: ShowdownPokemon = {
    species, nickname: nick ? nick[1].trim() : undefined, held_item: rawItem?.trim() || undefined,
    moves: [], evs: {}, ivs: {},
  };

  for (const line of lines.slice(1)) {
    if (line.startsWith("- ")) mon.moves.push(line.slice(2).trim());
    else if (line.startsWith("Ability:")) mon.ability = line.slice(8).trim();
    else if (line.startsWith("Tera Type:")) mon.tera_type = line.slice(10).trim();
    else if (line.startsWith("EVs:")) mon.evs = parseSpread(line.slice(4));
    else if (line.startsWith("IVs:")) mon.ivs = parseSpread(line.slice(4));
    else if (/ Nature$/.test(line)) mon.nature = line.replace(/ Nature$/, "").trim();
  }
  return mon;
}

export function parsePaste(paste: string): ShowdownPokemon[] {
  return paste
    .trim()
    .split(/\n\s*\n/)
    .map(parseBlock)
    .filter((p): p is ShowdownPokemon => p !== null);
}

const spread = (s: Record<string, number>) => Object.entries(s).map(([k, v]) => `${v} ${k}`).join(" / ");

/** Vuelve a escribir un set en formato Showdown (para exportar / copiar). */
export function toPaste(p: {
  name: string; held_item?: string | null; ability?: string | null; tera_type?: string | null;
  evs?: Record<string, number>; nature?: string | null; ivs?: Record<string, number>; moves?: string[];
}): string {
  const lines = [p.held_item ? `${p.name} @ ${p.held_item}` : p.name];
  if (p.ability) lines.push(`Ability: ${p.ability}`);
  if (p.tera_type) lines.push(`Tera Type: ${p.tera_type}`);
  if (p.evs && Object.keys(p.evs).length) lines.push(`EVs: ${spread(p.evs)}`);
  if (p.nature) lines.push(`${p.nature} Nature`);
  if (p.ivs && Object.keys(p.ivs).length) lines.push(`IVs: ${spread(p.ivs)}`);
  for (const m of p.moves ?? []) lines.push(`- ${m}`);
  return lines.join("\n");
}

/** Nombre de especie de Showdown → slug de PokéAPI ("Mr. Mime" → "mr-mime"). */
export function pokeapiSlug(species: string): string {
  return species
    .toLowerCase()
    .replace(/[.'’:]/g, "")
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
