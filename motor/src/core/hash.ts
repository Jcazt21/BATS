import { createHash } from 'node:crypto';

import { extractChannelMessages } from '../engine/sim.js';

/** `|t:|<unix>` es el reloj de pared del simulador: cambia en cada rejugada. */
const RELOJ = /^\|t:\|/;

export function esReloj(linea: string): boolean {
  return RELOJ.test(linea);
}

/**
 * Forma comparable de un log crudo del simulador: vista omnisciente (de cada `|split|` se queda
 * con la línea secreta) y sin las líneas de reloj. Dos rejugadas de la misma batalla dan
 * exactamente el mismo resultado.
 */
export function normalizeLog(lines: string[]): string[] {
  if (!lines.length) return [];
  return extractChannelMessages(lines.join('\n'), [-1])[-1].filter(linea => !esReloj(linea));
}

/** sha256 del log normalizado: es el `log_hash` que detecta la deriva del motor (D3). */
export function hashLog(lines: string[]): string {
  return createHash('sha256').update(normalizeLog(lines).join('\n')).digest('hex');
}
