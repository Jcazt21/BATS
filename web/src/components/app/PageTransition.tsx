import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { useLocation, useNavigationType } from "react-router-dom";
import { useReducedMotion, useSpring } from "@/lib/motion";
import { pageKey } from "@/lib/page-key";

/** Profundidad de una ruta: "/" y "/stats" son de primer nivel (1); "/pokedex/Gengar" es un detalle (2). */
const depth = (pathname: string) => Math.max(1, pathname.split("/").filter(Boolean).length);

/**
 * Solo se anima la entrada a un detalle (una ruta más profunda que la anterior), con un leve
 * ascenso y fundido. Entre secciones de primer nivel, al salir de un detalle, en la primera
 * carga y con atrás/adelante el cambio es inmediato: la navegación frecuente no debe hacer esperar.
 * Con "reducir movimiento": solo fundido.
 *
 * Se anima `transform` (no `y`) a propósito: así motion lo delega en el compositor
 * (WAAPI) y va a la frecuencia de la pantalla aunque el hilo principal esté ocupado
 * montando la página nueva, que es justo lo que pasa durante esta animación.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  // La ficha-modal de la Pokédex no es otra página: misma clave, sin remontar ni animar.
  const pathname = pageKey(useLocation().pathname);
  const navType = useNavigationType();
  const reduce = useReducedMotion();
  const transition = useSpring("snappy");

  // Ruta anterior, guardada durante el render (patrón de React para derivar de un cambio de prop).
  const [nav, setNav] = useState({ path: pathname, prev: pathname });
  if (nav.path !== pathname) setNav({ path: pathname, prev: nav.path });
  const entersDetail = navType !== "POP" && depth(pathname) > depth(nav.prev);

  return (
    <motion.div
      key={pathname}
      initial={entersDetail ? { opacity: 0, transform: reduce ? "none" : "translateY(6px)" } : false}
      animate={{ opacity: 1, transform: "none" }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
