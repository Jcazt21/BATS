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

/**
 * Motivos (en texto) por los que no se puede guardar el equipo. Lista vacía = se puede.
 * Solo bloquean las reglas que el servidor rechaza: las filas con `blocking: false`
 * (p. ej. tipo del mes) son informativas.
 */
export function saveBlockers({ team, rows, setErrors, learnsetsPending, learnsetsError }: SaveBlockersInput): string[] {
  const reasons: string[] = [];
  if (team.length === 0) reasons.push("El equipo está vacío");
  if (learnsetsError) reasons.push("No se pudieron comprobar los movimientos");
  else if (learnsetsPending) reasons.push("Comprobando movimientos…");
  for (const { name, count } of setErrors) {
    if (count > 0) reasons.push(`${name}: ${count} ${count === 1 ? "problema" : "problemas"} en el set`);
  }
  for (const r of rows) {
    if (!r.ok && r.blocking !== false) reasons.push(r.label);
  }
  return reasons;
}
