import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** Cómo funcionan las rotaciones: tres ideas siempre a la vista y el resto plegado. */
export function RotationRules({ maxRotations }: { maxRotations: number }) {
  return (
    <div className="flex flex-col gap-2 text-footnote text-muted-foreground">
      <ul className="list-disc pl-5">
        <li>Cambiar los 6 pokémon que llevas a batalla cuenta como una rotación.</li>
        <li>Se detectan solas al cargar tus batallas.</li>
        <li>Tienes {maxRotations} rotaciones por temporada.</li>
      </ul>
      <Collapsible>
        <CollapsibleTrigger className="group/rot flex min-h-11 items-center gap-1 rounded-lg text-subhead text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Cómo funcionan
          <ChevronDown className="size-4 transition-transform duration-200 ease-ios group-aria-expanded/rot:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="list-disc pl-5 pb-1">
            <li>Tu lineup inicial se fija con tu primera batalla.</li>
            <li>Editar un set no consume rotaciones.</li>
            <li>Agregar, quitar o reemplazar pokémon del pool solo es posible mientras el registro siga abierto.</li>
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
