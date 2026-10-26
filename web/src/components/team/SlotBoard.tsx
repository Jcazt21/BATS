import { useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, CircleDashed, Plus } from "lucide-react";
import { PokemonSprite } from "@/components/app/PokemonSprite";
import { TypeBadges } from "@/components/app/TypeBadge";
import { MonActions } from "@/components/team/MonActions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { SLOT_STATUS_LABEL, type SlotStatus } from "@/lib/dex/slotStatus";
import { spring, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface Slot {
  uid: string;
  name: string;
  types?: string | null;
  status: SlotStatus;
  banned?: boolean;
  /** El set tiene algo escrito: quitarlo pide confirmación. */
  hasContent: boolean;
}

interface Props {
  slots: Slot[];
  maxSize: number;
  selected: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onSwap: (index: number) => void;
  onCopy: (index: number) => void;
  /** Mueve el slot `index` una posición (-1 arriba/izquierda, +1 abajo/derecha). */
  onMove: (index: number, delta: -1 | 1) => void;
  /** Enter sobre un slot (en móvil abre el editor). */
  onOpen?: (index: number) => void;
}

const STATUS_ICON = {
  ready: <CheckCircle2 className="size-4 text-success" aria-hidden />,
  error: <AlertCircle className="size-4 text-destructive" aria-hidden />,
  incomplete: <CircleDashed className="size-4 text-muted-foreground" aria-hidden />,
  empty: null,
} as const;

/**
 * Los 6 slots del equipo de un vistazo: filas compactas en escritorio, tira horizontal con
 * snap en móvil. Un slot vacío es un objetivo ("Agregar Pokémon"), no un vacío. Teclado:
 * flechas mueven la selección, Alt+flecha reordena (el orden es el lineup de Showdown).
 */
export function SlotBoard({ slots, maxSize, selected, onSelect, onAdd, onRemove, onSwap, onCopy, onMove, onOpen }: Props) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [announce, setAnnounce] = useState("");
  const [confirming, setConfirming] = useState<number | null>(null);

  function focusSlot(i: number) {
    onSelect(i);
    refs.current[i]?.focus();
  }

  function onKeyDown(e: KeyboardEvent, i: number) {
    const prev = e.key === "ArrowUp" || e.key === "ArrowLeft";
    const next = e.key === "ArrowDown" || e.key === "ArrowRight";
    if (!prev && !next) {
      if (e.key === "Enter") onOpen?.(i);
      return;
    }
    e.preventDefault();
    const delta = prev ? -1 : 1;
    const target = i + delta;
    if (target < 0 || target >= slots.length) return;
    if (e.altKey) {
      onMove(i, delta);
      setAnnounce(`${slots[i].name} movido a la posición ${target + 1} de ${slots.length}`);
      // El foco sigue al pokémon movido una vez que React reordena.
      requestAnimationFrame(() => refs.current[target]?.focus());
    } else {
      focusSlot(target);
    }
  }

  function requestRemove(i: number) {
    if (slots[i].hasContent) setConfirming(i);
    else onRemove(i);
  }

  const empties = Math.max(0, maxSize - slots.length);

  return (
    <>
      <ul
        aria-label="Pokémon del equipo"
        className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:snap-none md:flex-col md:overflow-visible md:px-0 md:pb-0"
      >
        <AnimatePresence initial={false}>
          {slots.map((slot, i) => (
            <motion.li
              key={slot.uid}
              layout="position"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={reduce ? { duration: 0.15 } : spring.snappy}
              className={cn(
                "relative flex w-32 shrink-0 snap-start items-center rounded-2xl bg-card shadow-sm ring-1 ring-border md:w-auto",
                slot.banned && "ring-destructive/60",
                i === selected && "ring-2 ring-primary",
              )}
            >
              <button
                ref={(el) => { refs.current[i] = el; }}
                type="button"
                aria-pressed={i === selected}
                tabIndex={i === selected ? 0 : -1}
                onClick={() => onSelect(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className="press flex min-h-14 min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl p-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-row md:gap-3 md:text-left"
              >
                <PokemonSprite species={slot.name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-subhead font-medium">{slot.name}</span>
                  <TypeBadges types={slot.types} className="hidden md:inline-flex" />
                </span>
                {slot.banned && <Badge variant="destructive">Baneado</Badge>}
                <span role="img" aria-label={SLOT_STATUS_LABEL[slot.status]} className="shrink-0">
                  {STATUS_ICON[slot.status]}
                </span>
              </button>
              <MonActions
                name={slot.name}
                onCopy={() => onCopy(i)}
                onSwap={() => onSwap(i)}
                onRemove={() => requestRemove(i)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
        {Array.from({ length: empties }, (_, k) => (
          <li key={`empty-${k}`} className="w-32 shrink-0 snap-start md:w-auto">
            <button
              type="button"
              aria-label="Agregar Pokémon"
              onClick={onAdd}
              className="press flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-2 text-subhead text-muted-foreground outline-none transition-colors hover:border-primary/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-5" aria-hidden />
              <span className="hidden md:inline">Agregar Pokémon</span>
            </button>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="sr-only">{announce}</p>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar a {confirming !== null ? slots[confirming]?.name : ""}?</AlertDialogTitle>
            <AlertDialogDescription>Se pierde su set (objeto, habilidad y movimientos).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (confirming !== null) onRemove(confirming); setConfirming(null); }}>
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
