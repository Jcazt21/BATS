/**
 * Interruptor de Arena (invariante I12). Espejo de `bats_core/arena/flags.py`:
 * `off` (por defecto), `admins` o `all`; cualquier otro valor cuenta como `off`.
 */
export type ArenaMode = 'off' | 'admins' | 'all';

export interface Identidad {
  isAdmin: boolean;
}

export function arenaMode(env: Record<string, string | undefined> = process.env): ArenaMode {
  const valor = (env.BATS_ARENA_MODE ?? '').trim().toLowerCase();
  return valor === 'admins' || valor === 'all' ? valor : 'off';
}

export function arenaAllows(mode: ArenaMode, identidad: Identidad | null): boolean {
  if (mode === 'all') return true;
  return mode === 'admins' && identidad?.isAdmin === true;
}
