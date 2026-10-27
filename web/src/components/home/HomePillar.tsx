import { lazy, Suspense, useEffect, useState } from "react";
import { colorDelMes, debeAnimar, leerEntorno } from "@/lib/pillar";

// WebGL fuera del primer render: el chunk solo se pide si el entorno lo permite.
const LightPillar = lazy(() => import("@/components/effects/LightPillar"));

const leerAcento = () => getComputedStyle(document.documentElement).getPropertyValue("--primary");

/**
 * Fondo de la pantalla de Inicio (fijo, detrás de todo): degradado estático con el acento del mes (siempre) y, en oscuro con
 * movimiento y WebGL2, el pilar de luz encima. Decorativo: no recibe clics ni lo anuncian
 * los lectores de pantalla. Se recalcula al cambiar de mes (`data-month-type`) o de tema.
 */
export function HomePillar() {
  const [{ entorno, acento }, setEstado] = useState(() => ({ entorno: leerEntorno(), acento: leerAcento() }));

  useEffect(() => {
    const actualiza = () => setEstado({ entorno: leerEntorno(), acento: leerAcento() });
    const observer = new MutationObserver(actualiza);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-month-type", "style"] });
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", actualiza);
    return () => { observer.disconnect(); mq.removeEventListener("change", actualiza); };
  }, []);

  const colores = colorDelMes(acento);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 mix-blend-screen [mask-image:linear-gradient(to_bottom,black_35%,transparent_95%)]">
      <div data-testid="pilar-estatico" className="absolute inset-0 [background:radial-gradient(60%_70%_at_50%_0%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent)]" />
      {colores && debeAnimar(entorno) && (
        <Suspense fallback={null}>
          <LightPillar topColor={colores.top} bottomColor={colores.bottom} intensity={0.6} bloom={0.3} fade={0.3}
            mixBlendMode="normal" quality="low" rotationSpeed={0.15} interactive={false} clickPulse={false} />
        </Suspense>
      )}
    </div>
  );
}
