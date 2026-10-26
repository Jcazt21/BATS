import { ArrowLeftRight, ClipboardCopy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Acciones de una tarjeta del equipo: una principal ("Editar", 44px) y el resto en un menú.
 * Quitar solo avisa: quien lo usa debe pedir confirmación antes de borrar.
 */
export function MonActions({ name, onEdit, onCopy, onSwap, onRemove }: {
  name: string;
  /** Sin `onEdit` solo se muestra el menú (p. ej. en el tablero de slots, donde seleccionar ya edita). */
  onEdit?: () => void;
  onCopy: () => void;
  onSwap: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={onEdit ? "flex w-full gap-2" : "flex"}>
      {onEdit && <Button variant="secondary" size="lg" className="flex-1" onClick={onEdit}><Pencil /> Editar</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label={`Más acciones de ${name}`} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem className="min-h-11 text-subhead" onClick={onCopy}><ClipboardCopy /> Copiar set</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 text-subhead" onClick={onSwap}><ArrowLeftRight /> Cambiar por otro</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 text-subhead" variant="destructive" onClick={onRemove}><Trash2 /> Quitar del equipo</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
