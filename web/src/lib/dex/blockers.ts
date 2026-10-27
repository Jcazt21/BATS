import type { ChecklistRow } from "@/lib/api";
import type { BuilderMon } from "./validate";

export interface SaveBlockersInput {
  team: BuilderMon[];
  rows: ChecklistRow[];
  /** Problemas de cada set (ya calculados con checkSet); los de 0 se ignoran. */
  setErrors: { name: string; count: number }[];
  learnsetsPending: boolean;
  learnsetsError: boolean;
}

/** A dónde lleva un motivo: el slot culpable y/o la regla incumplida. */
export interface BlockerTarget { slot?: number; rule?: string }
export interface SaveBlocker { message: string; target?: BlockerTarget }

/**
 * Motivos (en texto) por los que no se puede guardar el equipo. Lista vacía = se puede.
 * Solo bloquean las reglas que el servidor rechaza: las filas con `blocking: false`
 * (p. ej. tipo del mes) son informativas.
 */
export function saveBlockerItems({ team, rows, setErrors, learnsetsPending, learnsetsError }: SaveBlockersInput): SaveBlocker[] {
  const reasons: SaveBlocker[] = [];
  if (team.length === 0) reasons.push({ message: "El equipo está vacío" });
  if (learnsetsError) reasons.push({ message: "No se pudieron comprobar los movimientos" });
  else if (learnsetsPending) reasons.push({ message: "Comprobando movimientos…" });
  setErrors.forEach(({ name, count }, slot) => {
    if (count > 0) reasons.push({ message: `${name}: ${count} ${count === 1 ? "problema" : "problemas"} en el set`, target: { slot } });
  });
  for (const r of rows) {
    if (!r.ok && r.blocking !== false) reasons.push({ message: r.label, target: { rule: r.rule } });
  }
  return reasons;
}

/** Igual que saveBlockerItems, solo los textos. */
export function saveBlockers(input: SaveBlockersInput): string[] {
  return saveBlockerItems(input).map((b) => b.message);
}
