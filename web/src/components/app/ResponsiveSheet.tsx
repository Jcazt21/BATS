import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { animate, motion, useDragControls, useMotionValue, useTransform } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { project, rubberband, spring, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Detalle contextual. En móvil es una hoja inferior que se arrastra con el dedo
 * (seguimiento 1:1, la velocidad al soltar decide si se cierra); en pantallas anchas,
 * un diálogo centrado. La hoja es interrumpible: se puede agarrar mientras se cierra.
 */
export function ResponsiveSheet(props: Props) {
  const wide = useMediaQuery("(min-width: 768px)");
  if (wide) {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        {/* Alto acotado y contenido desplazable: un formulario largo no se sale de la pantalla
            ni se lleva el botón de enviar fuera de la vista. */}
        <DialogContent className={cn("flex max-h-[85svh] flex-col overflow-hidden sm:max-w-lg", props.className)}>
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>{props.title}</DialogTitle>
            {props.description && <DialogDescription>{props.description}</DialogDescription>}
          </DialogHeader>
          <div className="-mx-6 -mb-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">{props.children}</div>
        </DialogContent>
      </Dialog>
    );
  }
  return <BottomSheet {...props} />;
}

function BottomSheet({ open, onOpenChange, title, description, children, className }: Props) {
  const reduce = useReducedMotion();
  const y = useMotionValue(0);
  const controls = useDragControls();
  const ref = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState(open);
  const height = () => ref.current?.getBoundingClientRect().height ?? 600;
  const backdrop = useTransform(y, [0, 400], [1, 0]);

  // Entrada: la hoja aparece desde abajo (o con fundido si se pide menos movimiento).
  useEffect(() => {
    if (open) {
      setPresent(true);
      y.set(reduce ? 0 : window.innerHeight);
      animate(y, 0, reduce ? { duration: 0.15 } : spring.default);
    } else if (present) {
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Cierra partiendo del punto actual del dedo y con su velocidad. */
  function close(velocity = 0) {
    animate(y, height() + 40, { ...(reduce ? { duration: 0.15 } : spring.momentum), velocity }).then(() => setPresent(false));
    onOpenChange(false);
  }

  if (!present) return null;

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          render={<motion.div style={{ opacity: backdrop }} />}
          className="fixed inset-0 z-50 bg-black/40"
        />
        <DialogPrimitive.Popup
          render={
            <motion.div
              ref={ref}
              style={{ y }}
              drag="y"
              dragControls={controls}
              dragListener={false}
              dragMomentum={false}
              dragElastic={0}
              onDrag={(_, info) => {
                // Hacia arriba: resistencia progresiva (no hay nada más allá).
                if (info.offset.y < 0) y.set(rubberband(info.offset.y, height()));
              }}
              onDragEnd={(_, info) => {
                const projected = info.offset.y + project(info.velocity.y);
                if (projected > height() * 0.5 || info.velocity.y > 800) close(info.velocity.y);
                else animate(y, 0, { ...spring.momentum, velocity: info.velocity.y });
              }}
            />
          }
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88svh] flex-col rounded-t-3xl bg-popover text-popover-foreground shadow-lg outline-none",
            "material-edge-top pb-safe",
            className,
          )}
        >
          {/* Asa: solo desde aquí se arrastra, para no pelearse con el scroll del contenido */}
          <div
            onPointerDown={(e) => controls.start(e)}
            className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-2 px-5 pt-2.5 pb-3 active:cursor-grabbing"
          >
            <span aria-hidden className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
            <div className="flex w-full items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-title3">{title}</DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="mt-0.5 text-footnote text-muted-foreground">{description}</DialogPrimitive.Description>
                )}
              </div>
              <Button variant="secondary" size="icon-sm" aria-label="Cerrar" onClick={() => close()}>
                <X />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
