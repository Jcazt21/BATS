import type { PlayerPokedexBestBattle, PlayerPokedexStats } from "@/lib/api";
import type { DexStatus } from "./collection";
import { speciesById, type DexEssentials } from "./snapshot";

/**
 * Estadísticas agregadas de una casilla de la Pokédex para un jugador:
 *   - "used": lo usó en al menos una batalla (gana sobre "faced").
 *   - "faced": solo lo enfrentó en el equipo rival.
 *   - "empty": por evolución o sin batallas registradas (p. ej. `battle.*` truncado).
 */
export type CellPlayerStats =
  | {
      kind: "used";
      battles: number;
      kills: number;
      mvp: number;
      best: PlayerPokedexBestBattle | null;
    }
  | {
      kind: "faced";
      battles: number;
      killsAgainst: number;
      wins: number;
    }
  | { kind: "empty" };

function pickBetterBattle(
  current: PlayerPokedexBestBattle | null,
  candidate: PlayerPokedexBestBattle | null | undefined,
): PlayerPokedexBestBattle | null {
  if (!candidate) return current;
  if (!current) return candidate;
  if (candidate.mvp !== current.mvp) return candidate.mvp > current.mvp ? candidate : current;
  return candidate.kills > current.kills ? candidate : current;
}

/**
 * Agrega las estadísticas de todas las formas pertenecientes a `cellNum`,
 * mapeando cada nombre/id de especie contra el dex local (`speciesById`/`num`).
 */
export function aggregateCellPlayerStats(
  dex: DexEssentials | undefined,
  cellNum: number,
  stats: PlayerPokedexStats | undefined,
  cellStatus: DexStatus,
): CellPlayerStats {
  if (!dex || !stats || cellStatus === "evolution" || cellStatus === "unknown") {
    return { kind: "empty" };
  }

  let usedBattles = 0;
  let usedKills = 0;
  let usedMvp = 0;
  let best: PlayerPokedexBestBattle | null = null;

  let facedBattles = 0;
  let facedKillsAgainst = 0;
  let facedWins = 0;

  for (const entry of stats.species) {
    const sp = speciesById(dex, entry.species);
    if (!sp || sp.num !== cellNum) continue;

    if (entry.used && entry.used.battles > 0) {
      usedBattles += entry.used.battles;
      usedKills += entry.used.kills;
      usedMvp += entry.used.mvp;
      best = pickBetterBattle(best, entry.used.best);
    }

    if (entry.faced && entry.faced.battles > 0) {
      facedBattles += entry.faced.battles;
      facedKillsAgainst += entry.faced.kills_against;
      facedWins += entry.faced.wins;
    }
  }

  if (usedBattles > 0) {
    return { kind: "used", battles: usedBattles, kills: usedKills, mvp: usedMvp, best };
  }

  if (facedBattles > 0) {
    return { kind: "faced", battles: facedBattles, killsAgainst: facedKillsAgainst, wins: facedWins };
  }

  return { kind: "empty" };
}
