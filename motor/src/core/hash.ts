import { extractChannelMessages } from '../engine/sim.js';

/** `|t:|<unix>` es el reloj de pared del simulador: cambia en cada rejugada. */
const RELOJ = /^\|t:\|/;

/**
 * Forma comparable de un log crudo del simulador: vista omnisciente (de cada `|split|` se queda
 * con la línea secreta) y sin las líneas de reloj. Dos rejugadas de la misma batalla dan
 * exactamente el mismo resultado.
 */
export function normalizeLog(lines: string[]): string[] {
  if (!lines.length) return [];
  return extractChannelMessages(lines.join('\n'), [-1])[-1].filter(linea => !RELOJ.test(linea));
}
