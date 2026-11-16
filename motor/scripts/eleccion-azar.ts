/**
 * Elecciones legales al azar a partir de una petición del simulador. Lo usan la prueba de
 * propiedad (F1.10) y la CLI de demostración (F1.13); no es parte del motor de producción.
 */

interface Pokemon {
  condition: string;
  active: boolean;
}

interface Peticion {
  wait?: boolean;
  teamPreview?: boolean;
  forceSwitch?: boolean[];
  active?: {
    moves?: { disabled?: boolean }[];
    trapped?: boolean;
    maybeTrapped?: boolean;
    canTerastallize?: string;
  }[];
  side?: { pokemon: Pokemon[] };
}

/** PRNG pequeño y determinista (mulberry32). */
export function crearAzar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function barajar<T>(items: T[], azar: () => number): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

const debilitado = (p: Pokemon) => p.condition.endsWith(' fnt');

/**
 * Elecciones plausibles para la petición, en orden de preferencia aleatorio. La primera suele
 * valer; las demás son el respaldo (p. ej. Revival Blessing pide un debilitado).
 * `[]` si la petición no exige elegir.
 */
export function eleccionesPosibles(peticion: unknown, azar: () => number): string[] {
  const p = peticion as Peticion | null;
  if (!p || p.wait || !p.side) return [];
  const mons = p.side.pokemon;

  if (p.teamPreview) {
    const orden = barajar(mons.map((_, i) => i + 1), azar);
    return [`team ${orden.join(', ')}`];
  }

  const banca = (filtro: (m: Pokemon) => boolean) =>
    mons.flatMap((m, i) => (!m.active && filtro(m) ? [i + 1] : []));

  if (p.forceSwitch) {
    const vivos = barajar(banca(m => !debilitado(m)), azar);
    const caidos = barajar(banca(debilitado), azar);
    return [...vivos, ...caidos].map(i => `switch ${i}`);
  }

  const activo = p.active?.[0];
  if (!activo) return [];
  const movimientos = (activo.moves ?? []).flatMap((m, i) => (m.disabled ? [] : [i + 1]));
  const atrapado = activo.trapped || activo.maybeTrapped;
  const cambios = atrapado ? [] : banca(m => !debilitado(m));

  const elecciones: string[] = [];
  if (cambios.length && azar() < 0.15) elecciones.push(`switch ${cambios[Math.floor(azar() * cambios.length)]}`);
  for (const i of barajar(movimientos, azar)) {
    elecciones.push(`move ${i}${activo.canTerastallize && azar() < 0.2 ? ' terastallize' : ''}`);
  }
  if (!elecciones.length) elecciones.push('move 1');
  return elecciones;
}
