import { isPokemonType, type PokemonType } from "./pokemon-types";

const KEY = "bats-month-type";

/** "Ice" → "ice"; null si no es uno de los 18 tipos (el acento cae a la laca por defecto). */
export function mesDeTipo(raw: string | null | undefined): PokemonType | null {
  const t = raw?.trim().toLowerCase() ?? "";
  return isPokemonType(t) ? t : null;
}

/** Pone o quita `data-month-type` en <html>; tokens.css deriva de él el acento (`--primary`). */
export function aplicarMes(tipo: PokemonType | null): void {
  const root = document.documentElement;
  if (tipo) root.dataset.monthType = tipo;
  else delete root.dataset.monthType;
}

export function guardarMes(tipo: PokemonType | null): void {
  try {
    if (tipo) localStorage.setItem(KEY, tipo);
    else localStorage.removeItem(KEY);
  } catch {
    /* modo privado o almacenamiento bloqueado: el acento sigue funcionando sin persistir */
  }
}

/** Antes del primer render: evita el parpadeo laca→mes mientras llega la temporada activa. */
export function aplicarMesGuardado(): void {
  try {
    aplicarMes(mesDeTipo(localStorage.getItem(KEY)));
  } catch {
    /* sin almacenamiento: se queda la laca hasta que responda la API */
  }
}
