import type { BattleRecord, Ctx, Lado } from './types.js';

export const LADOS: Lado[] = ['p1', 'p2'];

export function otroLado(lado: Lado): Lado {
  return lado === 'p1' ? 'p2' : 'p1';
}

/** Fecha límite de la decisión que empieza en `now` (`null` si la batalla no tiene reloj). */
export function nuevaFecha(now: Date, turnSeconds: number | null): Date | null {
  return turnSeconds === null ? null : new Date(now.getTime() + turnSeconds * 1000);
}

/** ¿La petición exige una elección? (`wait` y ausencia de petición no la exigen.) */
export function debeElegir(peticion: unknown): boolean {
  if (peticion === null || typeof peticion !== 'object') return false;
  return (peticion as { wait?: boolean }).wait !== true;
}

/** Lados a los que se les espera una elección que todavía no han hecho. */
export function ladosPendientes(record: BattleRecord): Lado[] {
  return LADOS.filter(lado => debeElegir(record.requests[lado]) && record.pending[lado] === null);
}

/** `true` si hay reloj, la batalla está viva y la fecha límite ya pasó. */
export function haVencido(record: BattleRecord, { now }: Ctx): boolean {
  if (record.status !== 'active' || record.turnSeconds === null || record.deadlineAt === null) return false;
  return now.getTime() >= new Date(record.deadlineAt).getTime();
}
