/**
 * Precarga: que navegar sea instantáneo.
 *
 *  • Cada página perezosa expone `preload()`; el mismo import sirve para `lazy` y para
 *    adelantarse, así que nunca se descarga dos veces.
 *  • Se precarga por intención (cursor encima, foco, dedo apoyado) — el clic llega
 *    ~100–300 ms después y para entonces el chunk ya está — y en reposo tras el
 *    primer pintado. Con "ahorro de datos" solo se precarga por intención.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

type Module<P> = { default: ComponentType<P> };

export type PreloadablePage<P = object> = LazyExoticComponent<ComponentType<P>> & {
  preload: () => Promise<Module<P>>;
};

export function lazyPage<P = object>(load: () => Promise<Module<P>>): PreloadablePage<P> {
  let pending: Promise<Module<P>> | undefined;
  const preload = () =>
    (pending ??= load().catch((e) => {
      // Un fallo de red no debe quedar cacheado: el siguiente intento vuelve a pedirlo.
      pending = undefined;
      throw e;
    }));
  return Object.assign(lazy(preload), { preload });
}

/** Ejecuta `fn` cuando el navegador esté ocioso (o poco después, si no hay requestIdleCallback). */
export function whenIdle(fn: () => void, timeout = 2000): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 200);
  return () => window.clearTimeout(id);
}

export function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!c?.saveData;
}
