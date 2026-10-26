import type { SetProblem } from "./validate";
import type { BuilderMon } from "./validate";

export type SlotStatus = "empty" | "incomplete" | "error" | "ready";

/** Estado de un slot del equipo: vacío, sin terminar, con errores o listo. */
export function slotStatus(
  mon: BuilderMon | null | undefined,
  problems: SetProblem[],
  learnsetPending: boolean,
): SlotStatus {
  if (!mon || !mon.species) return "empty";
  if (problems.length > 0) return "error";
  const complete = mon.moves.filter(Boolean).length >= 4 && !!mon.held_item && !!mon.ability;
  return complete && !learnsetPending ? "ready" : "incomplete";
}

export const SLOT_STATUS_LABEL: Record<SlotStatus, string> = {
  empty: "Vacío",
  incomplete: "Incompleto",
  error: "Con problemas",
  ready: "Listo",
};
