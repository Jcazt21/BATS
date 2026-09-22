import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { PageTransition } from "@/components/app/PageTransition";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { cn } from "@/lib/utils";

/**
 * Espera de una página que aún no ha llegado. Aparece con retraso: si la carga es
 * rápida (lo normal, con la precarga) no hay parpadeo de "cargando".
 */
export function PageFallback({ className }: { className?: string }) {
  return (
    <div className={cn("grid min-h-[40svh] place-items-center", className)} aria-busy>
      <span className="animate-in fade-in-0 duration-300 delay-300 fill-mode-both text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-hidden />
        <span className="sr-only">Cargando…</span>
      </span>
    </div>
  );
}

/**
 * Hueco de la página dentro de un shell. El Suspense vive aquí (no en la raíz) para que
 * las barras nunca desaparezcan; como el router navega en transición, al cambiar de
 * página se mantiene la anterior hasta que la nueva está lista, sin estados intermedios.
 */
export function RouteOutlet() {
  useScrollRestoration();
  return (
    <Suspense fallback={<PageFallback />}>
      <PageTransition>
        <Outlet />
      </PageTransition>
    </Suspense>
  );
}
