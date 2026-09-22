import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useLocation } from "react-router-dom";
import { useReducedMotion, useSpring } from "@/lib/motion";

/**
 * La página nueva entra con un leve ascenso y fundido. Resorte rápido y crítico: la
 * página está lista (precargada), así que el movimiento solo acompaña, no hace esperar.
 * Con "reducir movimiento": solo fundido.
 *
 * Se anima `transform` (no `y`) a propósito: así motion lo delega en el compositor
 * (WAAPI) y va a la frecuencia de la pantalla aunque el hilo principal esté ocupado
 * montando la página nueva, que es justo lo que pasa durante esta animación.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const transition = useSpring("snappy");
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, transform: reduce ? "none" : "translateY(6px)" }}
      animate={{ opacity: 1, transform: "none" }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
