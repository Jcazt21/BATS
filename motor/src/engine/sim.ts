/**
 * Único punto de importación del simulador (decisión D1).
 *
 * Nada más en el repo importa `@pkmn/sim` directamente: cambiar de paquete (p. ej. al oficial
 * `pokemon-showdown`, que expone la misma API) es tocar solo este archivo.
 */
export {
  Battle,
  Dex,
  PRNG,
  Teams,
  TeamValidator,
  extractChannelMessages,
  toID,
} from '@pkmn/sim';
export type { PokemonSet } from '@pkmn/sim';

/** Versión fijada del simulador; `motor/test/engine/version.test.ts` la compara con la instalada. */
export const ENGINE_VERSION = '0.11.0';
