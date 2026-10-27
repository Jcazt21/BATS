import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { ToastContext, type ToastInput } from "@/lib/toast";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface Item extends ToastInput { id: number }

const ICONS = {
  default: <Info className="size-5 text-info" />,
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <XCircle className="size-5 text-destructive" />,
};

const duracion = (t: ToastInput) => (t.tone === "error" ? 6000 : 3500);

/**
 * Un aviso. Su temporizador de cierre se pausa mientras `paused` (hover/foco sobre la pila)
 * y retoma con el tiempo que le quedaba; al desmontar se limpia solo.
 */
function ToastItem({ item, paused, onDone, onPause }: {
  item: Item;
  paused: boolean;
  onDone: (id: number) => void;
  onPause: (p: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const restante = useRef(duracion(item));

  useEffect(() => {
    if (paused) return;
    const inicio = Date.now();
    const h = window.setTimeout(() => onDone(item.id), restante.current);
    return () => {
      window.clearTimeout(h);
      restante.current -= Date.now() - inicio;
    };
  }, [paused, item.id, onDone]);

  // `transform` como string: se anima en el compositor (WAAPI); x/y/scale de motion irían por JS.
  const oculto = reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-12px) scale(0.96)" };
  const visible = reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px) scale(1)" };
  const salida = reduce
    ? { opacity: 0, transition: { duration: 0.12 } }
    : { opacity: 0, transform: "translateY(-8px) scale(0.96)", transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] as const } };

  return (
    <motion.div
      data-toast
      tabIndex={0}
      initial={oculto}
      animate={visible}
      exit={salida}
      transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
      onPointerEnter={() => onPause(true)}
      onPointerLeave={() => onPause(false)}
      onFocus={() => onPause(true)}
      onBlur={() => onPause(false)}
      className={cn("pointer-events-auto material-thick flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-lg ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      <span className="mt-0.5">{ICONS[item.tone ?? "default"]}</span>
      <div className="min-w-0">
        <p className="text-subhead font-medium">{item.title}</p>
        {item.description && <p className="text-footnote text-muted-foreground">{item.description}</p>}
      </div>
    </motion.div>
  );
}

/** Avisos breves de estado (completado / error). Se anuncian a lectores de pantalla y se cierran solos. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [paused, setPaused] = useState(false);
  const next = useRef(0);

  const toast = useCallback((t: ToastInput) => {
    const id = next.current++;
    setItems((cur) => [...cur.slice(-2), { ...t, id }]);
  }, []);
  const done = useCallback((id: number) => setItems((cur) => cur.filter((i) => i.id !== id)), []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+4.25rem)]"
      >
        <AnimatePresence>
          {items.map((i) => (
            <ToastItem key={i.id} item={i} paused={paused} onDone={done} onPause={setPaused} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
