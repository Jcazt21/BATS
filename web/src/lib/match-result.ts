import type { LeaderboardEntry, MatchResult } from "@/lib/api";

/** W/L/T de la API → V/D/E en pantalla. */
export const resultLetter = (r: MatchResult): "V" | "D" | "E" => (r === "W" ? "V" : r === "L" ? "D" : "E");

/** Racha actual en corto: "3V", "1E", "2D"; sin batallas, "—". */
export const streakLabel = (s: LeaderboardEntry["streak"] | undefined): string =>
  s?.type && s.length > 0 ? `${s.length}${resultLetter(s.type)}` : "—";
