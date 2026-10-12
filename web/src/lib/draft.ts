import type { BuilderMon } from "@/lib/dex/validate";

export interface Draft {
  savedAt: string;
  team: BuilderMon[];
}

/** Clave del borrador del registro: una por temporada y jugador. */
export const draftKey = (seasonId: number, username: string): string => `bats:teambuilder:${seasonId}:${username}`;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isOptString = (v: unknown): boolean => v === undefined || v === null || typeof v === "string";

/** Normaliza un pokémon guardado; null si le falta algo imprescindible (borrador viejo o corrupto). */
function parseMon(v: unknown): BuilderMon | null {
  if (!isRecord(v) || typeof v.species !== "string") return null;
  if (!Array.isArray(v.moves) || !v.moves.every((m) => typeof m === "string")) return null;
  if (v.evs !== undefined && !isRecord(v.evs)) return null;
  if (v.ivs !== undefined && !isRecord(v.ivs)) return null;
  if (![v.held_item, v.ability, v.nature, v.tera_type].every(isOptString)) return null;
  return { ...(v as unknown as BuilderMon), evs: (v.evs ?? {}) as BuilderMon["evs"], ivs: (v.ivs ?? {}) as BuilderMon["ivs"] };
}

export function loadDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Draft> | null;
    if (!v || typeof v.savedAt !== "string" || !Array.isArray(v.team) || v.team.length === 0) return null;
    const team = v.team.map(parseMon);
    if (team.some((m) => m === null)) {
      // Borrador viejo o corrupto: se descarta entero para que no rompa el render en cada carga.
      clearDraft(key);
      return null;
    }
    return { savedAt: v.savedAt, team: team as BuilderMon[] };
  } catch {
    return null;
  }
}

/** Un equipo vacío no se guarda: borra el borrador para no dejar uno viejo. */
export function saveDraft(key: string, team: BuilderMon[]): void {
  if (team.length === 0) {
    clearDraft(key);
    return;
  }
  try {
    const draft: Draft = { savedAt: new Date().toISOString(), team };
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* modo privado o almacenamiento bloqueado: se trabaja sin borrador */
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ver saveDraft */
  }
}
