/**
 * Motion — resortes y física para el gesto (principios de "Designing Fluid Interfaces").
 *
 *  • Por defecto, amortiguamiento crítico (bounce 0): grácil y sin distraer.
 *  • Rebote (~0.2) SOLO cuando el gesto traía inercia (soltar tras arrastrar).
 *  • Los resortes parten del valor actual y heredan la velocidad: son interrumpibles.
 */
import { useReducedMotion, type Transition } from "motion/react";

export const spring = {
  /** Reposicionar, cambiar de pestaña, aparecer. */
  default: { type: "spring", bounce: 0, duration: 0.4 } as Transition,
  /** Respuesta rápida: pulsaciones y pequeños ajustes. */
  snappy: { type: "spring", bounce: 0, duration: 0.28 } as Transition,
  /** Tras un gesto con inercia (flick de una hoja): un poco de rebote. */
  momentum: { type: "spring", bounce: 0.2, duration: 0.4 } as Transition,
};

/** Con "reducir movimiento": fundido corto, sin desplazamientos ni rebotes. */
export const fade: Transition = { duration: 0.15, ease: "easeOut" };

/** Devuelve la transición adecuada a la preferencia del usuario. */
export function useSpring(kind: keyof typeof spring = "default"): Transition {
  const reduce = useReducedMotion();
  return reduce ? fade : spring[kind];
}

export { useReducedMotion };

/**
 * Dónde terminaría un movimiento con esa velocidad si decelerara como el scroll.
 * Forma exponencial de Apple (no v²/2a). `velocity` en px/s; `rate` 0.998 = scroll normal.
 */
export function project(velocity: number, rate = 0.998): number {
  return ((velocity / 1000) * rate) / (1 - rate);
}

/** Resistencia progresiva más allá de un borde: cuanto más te pasas, menos sigue. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  const abs = Math.abs(overshoot);
  const eased = (abs * dimension * constant) / (dimension + constant * abs);
  return overshoot < 0 ? -eased : eased;
}
