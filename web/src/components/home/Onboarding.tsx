import { useState } from "react";
import { Button } from "@/components/ui/button";

export const ONBOARDING_KEY = "bats:onboarding:v1";

/** Bienvenida de la primera visita. localStorage puede fallar (modo privado): sin él se muestra y se cierra igual. */
export function Onboarding() {
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(ONBOARDING_KEY); } catch { return true; }
  });
  if (!visible) return null;

  function dismiss() {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* sin almacenamiento: se oculta solo en esta visita */ }
    setVisible(false);
  }

  return (
    <section aria-label="Bienvenida" className="animate-in fade-in-0 duration-200 flex flex-col gap-3 rounded-2xl bg-info-soft p-5 text-info">
      <h2 className="text-headline">Bienvenido a la liga</h2>
      <ul className="list-disc pl-5 text-subhead">
        <li><strong className="font-medium">Estadísticas y Pokédex:</strong> cómo rinde cada jugador y cada pokémon.</li>
        <li><strong className="font-medium">Mi equipo:</strong> registra tu pool y comprueba las reglas en vivo.</li>
        <li><strong className="font-medium">Bans:</strong> vota por el pokémon que rompe la liga.</li>
      </ul>
      <Button variant="secondary" size="sm" className="self-start" onClick={dismiss}>Entendido</Button>
    </section>
  );
}
