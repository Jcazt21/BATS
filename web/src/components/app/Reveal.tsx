import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Entrada del contenido tras la carga: un fundido corto al montar. Es solo CSS sobre
 * un nodo estable, así que un refetch (mismo nodo, hijos nuevos) no la repite; para
 * volver a animar hay que remontarlo con `key`.
 */
export function Reveal({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("animate-in fade-in-0 duration-200", className)} {...props} />;
}
