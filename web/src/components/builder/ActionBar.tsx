import { ClipboardCopy, Import, Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { BlockerTarget, SaveBlocker } from "@/lib/dex/blockers";
import { cn } from "@/lib/utils";

interface Props {
  blockers: SaveBlocker[];
  busy: boolean;
  saveLabel: string;
  onSave: () => void;
  /** Tocar un motivo lleva a su causa (slot o regla). */
  onJump: (target: BlockerTarget) => void;
  onImport: () => void;
  onCopy: () => void;
  copyDisabled?: boolean;
  /** Error de guardado del servidor, ya traducido. */
  error?: string | null;
  /** En una hoja el `fixed` queda atrapado por el transform: la barra se pega con `sticky` al fondo de la hoja. */
  inline?: boolean;
}

const MAX_SHOWN = 3;

/**
 * Barra de acción al pie del builder: guardar, el primer motivo que lo impide (clicable: lleva
 * a la causa) y el menú de importar/copiar. Pegada con `sticky` para que el botón nunca quede
 * lejos del editor; en móvil queda sobre la barra de reglas y el TabBar.
 */
export function ActionBar({ blockers, busy, saveLabel, onSave, onJump, onImport, onCopy, copyDisabled, error, inline }: Props) {
  const ok = blockers.length === 0;
  return (
    <div
      className={cn(
        "material-regular material-edge-top sticky z-30 -mx-4 flex flex-col gap-2 px-4 py-3 sm:-mx-6 sm:px-6",
        inline ? "bottom-0" : "bottom-[calc(7.25rem+env(safe-area-inset-bottom))] md:bottom-0",
      )}
    >
      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-footnote text-destructive">{error}</p>}
      {!ok && (
        <ul data-testid="save-blockers" aria-label="Motivos por los que no se puede guardar" className="flex flex-col text-footnote text-muted-foreground">
          {blockers.slice(0, MAX_SHOWN).map((b) => (
            <li key={b.message}>
              {b.target ? (
                <button type="button" onClick={() => onJump(b.target!)} className="press min-h-9 text-left underline-offset-2 hover:underline focus-visible:underline">
                  {b.message}
                </button>
              ) : (
                <span className="inline-block min-h-9 py-2">{b.message}</span>
              )}
            </li>
          ))}
          {blockers.length > MAX_SHOWN && <li>y {blockers.length - MAX_SHOWN} más</li>}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button size="lg" className="flex-1" disabled={!ok || busy} onClick={onSave}>
          {busy ? <><Loader2 className="animate-spin" /> Guardando…</> : saveLabel}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="secondary" size="icon-lg" aria-label="Importar o copiar equipo" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            <DropdownMenuItem className="min-h-11 text-subhead" onClick={onImport}><Import /> Importar equipo</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 text-subhead" disabled={copyDisabled} onClick={onCopy}><ClipboardCopy /> Copiar equipo</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
