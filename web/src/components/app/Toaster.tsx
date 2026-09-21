import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { ToastContext, type ToastInput } from "@/lib/toast";
import { useSpring } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface Item extends ToastInput { id: number }

const ICONS = {
  default: <Info className="size-5 text-info" />,
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <XCircle className="size-5 text-destructive" />,
};

/** Avisos breves de estado (completado / error). Se anuncian a lectores de pantalla y se cierran solos. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(0);
  const transition = useSpring("default");

  const toast = useCallback((t: ToastInput) => {
    const id = next.current++;
    setItems((cur) => [...cur.slice(-2), { ...t, id }]);
    window.setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), t.tone === "error" ? 6000 : 3500);
  }, []);

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
            <motion.div
              key={i.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={transition}
              className={cn("pointer-events-auto material-thick flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-lg ring-1 ring-border")}
            >
              <span className="mt-0.5">{ICONS[i.tone ?? "default"]}</span>
              <div className="min-w-0">
                <p className="text-subhead font-medium">{i.title}</p>
                {i.description && <p className="text-footnote text-muted-foreground">{i.description}</p>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
