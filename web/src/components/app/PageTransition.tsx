import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useLocation } from "react-router-dom";
import { useReducedMotion, useSpring } from "@/lib/motion";

/** La página nueva entra con un leve ascenso y fundido. Con "reducir movimiento": solo fundido. */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const transition = useSpring("default");
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: reduce ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
