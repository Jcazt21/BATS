import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Forma de `tests/fixtures/arena/golden/dorada-NN.json` (las genera `tools/arena_fixtures.mjs`). */
export interface Dorada {
  id: string;
  formatId: string;
  rules: string;
  seed: string;
  p1: string;
  p2: string;
  winner: string;
  turns: number;
  endType: 'normal' | 'forfeit' | 'tie';
  p1team: { name: string; species: string }[];
  p2team: { name: string; species: string }[];
  inputLog: string[];
  /** Vista omnisciente (canal -1), sin `|t:|`. */
  log: string[];
  /** Tandas crudas, con marcadores `|split|`. */
  updates: string[][];
  viewP1: string[][];
  viewP2: string[][];
  viewSpectator: string[][];
  /** Petición vigente de cada lado tras cada tanda. Solo en la dorada más corta. */
  requests?: { p1: unknown; p2: unknown }[];
}

const DIR = fileURLToPath(new URL('../../../tests/fixtures/arena/golden/', import.meta.url));

export const doradas: Dorada[] = readdirSync(DIR)
  .filter(nombre => nombre.endsWith('.json'))
  .sort()
  .map(nombre => JSON.parse(readFileSync(DIR + nombre, 'utf8')) as Dorada);
