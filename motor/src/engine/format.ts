import { Dex, TeamValidator, type PokemonSet } from './sim.js';

/**
 * Comprueba la cadena de formato (D5), p. ej. `gen9nationaldexag@@@Standard NatDex,-Baton Pass`.
 * Devuelve la lista de problemas; vacía si es válida.
 */
export function checkFormat(rules: string): string[] {
  try {
    Dex.formats.validate(rules);
    return [];
  } catch (error) {
    return [`Formato inválido: ${error instanceof Error ? error.message : String(error)}`];
  }
}

/**
 * Valida un equipo contra la cadena de formato con el `TeamValidator` del simulador. Vacía si
 * el equipo es legal. Una cadena de formato inválida se informa como error, no como excepción.
 */
export function validateTeam(rules: string, team: PokemonSet[]): string[] {
  const errores = checkFormat(rules);
  if (errores.length) return errores;
  return TeamValidator.get(rules).validateTeam(team) ?? [];
}
